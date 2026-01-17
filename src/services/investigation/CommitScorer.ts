import logger from '../../lib/utils/logger';
import type { CommitScore } from '../../lib/types/evidence';
import type {
  CommitScoringInput,
  CommitScoringContext,
  ScoredCommit,
  ScoringFactor,
} from './types';

/**
 * Scores commits based on their likelihood of being related to an incident
 */
export class CommitScorer {
  private readonly recentDeploymentWindowMs: number;

  constructor(recentDeploymentWindowHours: number = 24) {
    this.recentDeploymentWindowMs = recentDeploymentWindowHours * 60 * 60 * 1000;
  }

  /**
   * Score a list of commits and sort by relevance
   */
  scoreCommits(commits: CommitScoringInput[], context: CommitScoringContext): ScoredCommit[] {
    logger.debug('Scoring commits', { count: commits.length });

    const scoredCommits = commits.map((commit) => this.scoreCommit(commit, context));

    // Sort by combined score descending
    scoredCommits.sort((a, b) => b.score.combined - a.score.combined);

    logger.debug('Commits scored', {
      count: scoredCommits.length,
      topScore: scoredCommits[0]?.score.combined ?? 0,
    });

    return scoredCommits;
  }

  /**
   * Score a single commit
   */
  private scoreCommit(commit: CommitScoringInput, context: CommitScoringContext): ScoredCommit {
    const factors: ScoringFactor[] = [];

    // Temporal score (how close to incident time)
    const temporalScore = this.calculateTemporalScore(commit, context, factors);

    // Risk score (based on commit characteristics)
    const riskScore = this.calculateRiskScore(commit, context, factors);

    // Combined weighted score
    const combined = temporalScore * 0.4 + riskScore * 0.6;

    const score: CommitScore = {
      temporal: temporalScore,
      risk: riskScore,
      combined: Math.round(combined * 100) / 100,
    };

    return {
      ...commit,
      score,
      scoringFactors: factors,
    };
  }

  /**
   * Calculate temporal proximity score
   */
  private calculateTemporalScore(
    commit: CommitScoringInput,
    context: CommitScoringContext,
    factors: ScoringFactor[]
  ): number {
    const commitTime = commit.timestamp.getTime();
    const incidentTime = context.incidentDetectedAt.getTime();
    const timeDiff = incidentTime - commitTime;

    // Commits after incident get lower score
    if (timeDiff < 0) {
      factors.push({
        name: 'after_incident',
        weight: 0.4,
        value: 0,
        contribution: 0,
        reason: 'Commit was made after incident detection',
      });
      return 0;
    }

    // Score based on time proximity (closer = higher score)
    const windowMs = context.recentDeploymentWindow || this.recentDeploymentWindowMs;
    const proximityScore = Math.max(0, 1 - timeDiff / windowMs);

    factors.push({
      name: 'temporal_proximity',
      weight: 0.4,
      value: proximityScore,
      contribution: proximityScore * 0.4,
      reason: `Commit ${Math.round(timeDiff / (60 * 1000))} minutes before incident`,
    });

    // Bonus for deployment commit
    if (context.deploymentCommitSha && commit.sha === context.deploymentCommitSha) {
      factors.push({
        name: 'deployment_commit',
        weight: 0.2,
        value: 1,
        contribution: 0.2,
        reason: 'This commit triggered the deployment',
      });
      return Math.min(1, proximityScore + 0.3);
    }

    return proximityScore;
  }

  /**
   * Calculate risk score based on commit characteristics
   */
  private calculateRiskScore(
    commit: CommitScoringInput,
    context: CommitScoringContext,
    factors: ScoringFactor[]
  ): number {
    let score = 0;

    // File path match (if stack trace available)
    if (context.stackTraceFilePath) {
      const matchesStackTrace = commit.filesChanged.some((file) =>
        this.filePathsMatch(file, context.stackTraceFilePath!)
      );

      if (matchesStackTrace) {
        factors.push({
          name: 'stack_trace_match',
          weight: 0.3,
          value: 1,
          contribution: 0.3,
          reason: 'Modified file appears in stack trace',
        });
        score += 0.35;
      }
    }

    // Change size factor (larger changes are riskier)
    const totalChanges = commit.additions + commit.deletions;
    const changeSizeScore = this.calculateChangeSizeScore(totalChanges);
    factors.push({
      name: 'change_size',
      weight: 0.15,
      value: changeSizeScore,
      contribution: changeSizeScore * 0.15,
      reason: `${totalChanges} lines changed (${commit.additions}+/${commit.deletions}-)`,
    });
    score += changeSizeScore * 0.2;

    // Risky file patterns
    const riskyFileScore = this.calculateRiskyFileScore(commit.filesChanged, factors);
    score += riskyFileScore * 0.25;

    // Risky commit message patterns
    const messageScore = this.calculateMessageScore(commit.message, factors);
    score += messageScore * 0.2;

    return Math.min(1, score);
  }

  /**
   * Calculate score based on change size
   */
  private calculateChangeSizeScore(totalChanges: number): number {
    // Small changes (< 50 lines) get moderate score
    // Medium changes (50-200) get higher score
    // Very large changes (> 500) get lower score (likely refactoring)
    if (totalChanges < 10) return 0.2;
    if (totalChanges < 50) return 0.5;
    if (totalChanges < 200) return 0.8;
    if (totalChanges < 500) return 0.6;
    return 0.3;
  }

  /**
   * Calculate score based on risky file patterns
   */
  private calculateRiskyFileScore(filesChanged: string[], factors: ScoringFactor[]): number {
    const riskyPatterns = [
      { pattern: /config/i, name: 'config_file', weight: 0.7 },
      { pattern: /migration/i, name: 'migration_file', weight: 0.9 },
      { pattern: /schema/i, name: 'schema_file', weight: 0.8 },
      { pattern: /env/i, name: 'env_file', weight: 0.7 },
      { pattern: /database|db/i, name: 'database_file', weight: 0.8 },
      { pattern: /api|route|endpoint/i, name: 'api_file', weight: 0.6 },
      { pattern: /auth|security/i, name: 'auth_file', weight: 0.8 },
    ];

    let maxScore = 0;
    const matchedPatterns: string[] = [];

    for (const file of filesChanged) {
      for (const { pattern, name, weight } of riskyPatterns) {
        if (pattern.test(file)) {
          maxScore = Math.max(maxScore, weight);
          if (!matchedPatterns.includes(name)) {
            matchedPatterns.push(name);
          }
        }
      }
    }

    if (matchedPatterns.length > 0) {
      factors.push({
        name: 'risky_files',
        weight: 0.2,
        value: maxScore,
        contribution: maxScore * 0.2,
        reason: `Modified risky files: ${matchedPatterns.join(', ')}`,
      });
    }

    return maxScore;
  }

  /**
   * Calculate score based on commit message
   */
  private calculateMessageScore(message: string, factors: ScoringFactor[]): number {
    const lowerMessage = message.toLowerCase();
    let score = 0.3; // Base score

    // Positive indicators (potential fixes that might introduce bugs)
    const positivePatterns = [
      { pattern: /fix|hotfix|patch/i, boost: 0.2 },
      { pattern: /urgent|critical|emergency/i, boost: 0.3 },
      { pattern: /quick|temp|hack/i, boost: 0.25 },
      { pattern: /revert/i, boost: 0.15 },
    ];

    // Negative indicators (less likely to cause issues)
    const negativePatterns = [
      { pattern: /test|spec/i, penalty: 0.3 },
      { pattern: /doc|readme|comment/i, penalty: 0.4 },
      { pattern: /lint|format|style/i, penalty: 0.35 },
      { pattern: /typo|spelling/i, penalty: 0.3 },
    ];

    const matchedPositive: string[] = [];
    const matchedNegative: string[] = [];

    for (const { pattern, boost } of positivePatterns) {
      if (pattern.test(lowerMessage)) {
        score += boost;
        matchedPositive.push(pattern.source);
      }
    }

    for (const { pattern, penalty } of negativePatterns) {
      if (pattern.test(lowerMessage)) {
        score -= penalty;
        matchedNegative.push(pattern.source);
      }
    }

    score = Math.max(0, Math.min(1, score));

    if (matchedPositive.length > 0 || matchedNegative.length > 0) {
      factors.push({
        name: 'commit_message',
        weight: 0.15,
        value: score,
        contribution: score * 0.15,
        reason:
          matchedPositive.length > 0
            ? `Contains risky keywords in message`
            : `Contains low-risk keywords in message`,
      });
    }

    return score;
  }

  /**
   * Check if two file paths refer to the same file
   */
  private filePathsMatch(commitPath: string, stackTracePath: string): boolean {
    // Normalize paths
    const normalizedCommit = commitPath.replace(/\\/g, '/').toLowerCase();
    const normalizedStackTrace = stackTracePath.replace(/\\/g, '/').toLowerCase();

    // Direct match
    if (normalizedCommit === normalizedStackTrace) return true;

    // Check if one ends with the other (handles different root paths)
    if (
      normalizedCommit.endsWith(normalizedStackTrace) ||
      normalizedStackTrace.endsWith(normalizedCommit)
    ) {
      return true;
    }

    // Extract filename and compare
    const commitFilename = normalizedCommit.split('/').pop();
    const stackTraceFilename = normalizedStackTrace.split('/').pop();

    return commitFilename === stackTraceFilename;
  }
}
