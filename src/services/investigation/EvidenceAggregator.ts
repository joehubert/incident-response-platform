import type { InvestigationTier } from '../../lib/types/common';
import type {
  EvidenceBundle,
  DatadogContext,
  GitLabContext,
  DatabaseContext,
  SourcegraphContext,
  CommitInfo,
} from '../../lib/types/evidence';
import type { Incident } from '../../lib/types/incident';
import type { GitLabCommitDiff } from '../../lib/clients/gitlab/types';
import type { SourcegraphSearchResult } from '../../lib/clients/sourcegraph/types';
import type { InvestigationResult as DbInvestigationResult } from '../../lib/clients/database/DatabaseInvestigationClient';
import type { ScoredCommit, EvidenceCollectionError } from './types';
import logger from '../../lib/utils/logger';

export interface AggregationInput {
  incident: Incident;
  tier: InvestigationTier;
  datadogContext?: DatadogContext;
  gitlabCommits?: ScoredCommit[];
  gitlabDiffs?: Map<string, GitLabCommitDiff>;
  gitlabPipelines?: Map<string, { status: string; url: string }>;
  gitlabMergeRequests?: Map<string, { id: number; title: string; url: string }>;
  databaseResults?: DbInvestigationResult;
  sourcegraphResults?: SourcegraphSearchResult;
  errors: EvidenceCollectionError[];
}

/**
 * Aggregates evidence from multiple sources into a unified EvidenceBundle
 */
export class EvidenceAggregator {
  /**
   * Aggregate all collected evidence into a single bundle
   */
  aggregate(input: AggregationInput): EvidenceBundle {
    logger.debug('Aggregating evidence', {
      incidentId: input.incident.id,
      tier: input.tier,
      hasGitLabCommits: !!input.gitlabCommits?.length,
      hasDbResults: !!input.databaseResults,
      hasSourcegraphResults: !!input.sourcegraphResults,
    });

    const bundle: EvidenceBundle = {
      incidentId: input.incident.id,
      investigationTier: input.tier,
      completeness: 0,
      collectedAt: new Date(),
      datadogContext: input.datadogContext || this.buildDefaultDatadogContext(input.incident),
      warnings: [],
    };

    // Add GitLab context if available
    if (input.gitlabCommits && input.gitlabCommits.length > 0) {
      bundle.gitlabContext = this.buildGitLabContext(
        input.gitlabCommits,
        input.gitlabDiffs,
        input.gitlabPipelines,
        input.gitlabMergeRequests,
        input.datadogContext
      );
    }

    // Add database context if available
    if (input.databaseResults) {
      bundle.databaseContext = this.buildDatabaseContext(input.databaseResults);
    }

    // Add sourcegraph context if available
    if (input.sourcegraphResults) {
      bundle.sourcegraphContext = this.buildSourcegraphContext(input.sourcegraphResults);
    }

    // Add warnings from errors
    for (const error of input.errors) {
      if (error.recoverable) {
        bundle.warnings?.push(`${error.source}: ${error.error}`);
      }
    }

    // Calculate completeness
    bundle.completeness = this.calculateCompleteness(bundle, input.tier);

    logger.debug('Evidence aggregation complete', {
      incidentId: input.incident.id,
      completeness: bundle.completeness,
      warnings: bundle.warnings?.length || 0,
    });

    return bundle;
  }

  /**
   * Build default Datadog context from incident
   */
  private buildDefaultDatadogContext(incident: Incident): DatadogContext {
    const context: DatadogContext = {
      metricHistory: [],
    };

    if (incident.errorMessage || incident.stackTrace) {
      context.errorDetails = {
        errorMessage: incident.errorMessage || 'Unknown error',
        stackTrace: incident.stackTrace || '',
        filePath: this.extractFilePathFromStackTrace(incident.stackTrace),
        lineNumber: this.extractLineNumberFromStackTrace(incident.stackTrace),
      };
    }

    return context;
  }

  /**
   * Build GitLab context from scored commits
   */
  private buildGitLabContext(
    scoredCommits: ScoredCommit[],
    diffs?: Map<string, GitLabCommitDiff>,
    pipelines?: Map<string, { status: string; url: string }>,
    mergeRequests?: Map<string, { id: number; title: string; url: string }>,
    datadogContext?: DatadogContext
  ): GitLabContext {
    const commits: CommitInfo[] = scoredCommits.map((sc) => {
      const diff = diffs?.get(sc.sha);
      const pipeline = pipelines?.get(sc.sha);
      const mr = mergeRequests?.get(sc.sha);

      return {
        sha: sc.sha,
        message: sc.message,
        author: sc.author,
        timestamp: sc.timestamp,
        repository: sc.repository,
        diff: diff?.files.map((f) => f.diff).join('\n---\n'),
        filesChanged: sc.filesChanged,
        additions: sc.additions,
        deletions: sc.deletions,
        score: sc.score,
        pipeline: pipeline
          ? {
              status: pipeline.status as 'success' | 'failed' | 'running' | 'canceled',
              url: pipeline.url,
            }
          : undefined,
        mergeRequest: mr
          ? {
              id: mr.id,
              title: mr.title,
              url: mr.url,
            }
          : undefined,
      };
    });

    // Determine scoring method used
    let scoringMethod: 'deployment' | 'stack-trace' | 'temporal' = 'temporal';
    if (datadogContext?.deploymentEvent) {
      scoringMethod = 'deployment';
    } else if (datadogContext?.errorDetails?.stackTrace) {
      scoringMethod = 'stack-trace';
    }

    return {
      commits,
      scoringMethod,
    };
  }

  /**
   * Build database context from investigation results
   */
  private buildDatabaseContext(results: DbInvestigationResult): DatabaseContext {
    // Determine relevance based on findings
    let relevance: 'high' | 'medium' | 'low' = 'low';

    const totalFindings =
      results.schemaFindings.length +
      results.dataFindings.length +
      results.performanceFindings.length;

    if (totalFindings === 0) {
      relevance = 'low';
    } else if (
      results.schemaFindings.some((f) => f.severity === 'high') ||
      results.dataFindings.some((f) => f.severity === 'high') ||
      results.performanceFindings.some((f) => f.severity === 'high')
    ) {
      relevance = 'high';
    } else if (totalFindings > 3) {
      relevance = 'medium';
    }

    return {
      schemaFindings: results.schemaFindings,
      dataFindings: results.dataFindings,
      performanceFindings: results.performanceFindings,
      relevance,
    };
  }

  /**
   * Build sourcegraph context from search results
   */
  private buildSourcegraphContext(results: SourcegraphSearchResult): SourcegraphContext {
    return {
      affectedRepositories: results.affectedRepositories,
      estimatedReferences: results.totalMatchCount,
      criticalPaths: results.criticalPaths,
      matches: results.matches.map((m) => ({
        repository: m.repository,
        filePath: m.filePath,
        lineNumber: m.lineNumber,
        preview: m.preview,
        matchCount: m.matchCount,
      })),
    };
  }

  /**
   * Calculate completeness score for the evidence bundle
   */
  private calculateCompleteness(bundle: EvidenceBundle, tier: InvestigationTier): number {
    const weights = this.getCompletenessWeights(tier);
    let score = 0;
    let totalWeight = 0;

    // Datadog context (always required)
    totalWeight += weights.datadog;
    if (bundle.datadogContext) {
      score += weights.datadog;
      // Bonus for having error details
      if (bundle.datadogContext.errorDetails) {
        score += weights.datadog * 0.2;
      }
    }

    // GitLab context
    if (weights.gitlab > 0) {
      totalWeight += weights.gitlab;
      if (bundle.gitlabContext && bundle.gitlabContext.commits.length > 0) {
        score += weights.gitlab;
        // Bonus for having diffs
        if (bundle.gitlabContext.commits.some((c) => c.diff)) {
          score += weights.gitlab * 0.2;
        }
      }
    }

    // Database context
    if (weights.database > 0) {
      totalWeight += weights.database;
      if (bundle.databaseContext) {
        score += weights.database;
      }
    }

    // Sourcegraph context
    if (weights.sourcegraph > 0) {
      totalWeight += weights.sourcegraph;
      if (bundle.sourcegraphContext) {
        score += weights.sourcegraph;
      }
    }

    return Math.min(1, score / totalWeight);
  }

  /**
   * Get completeness weights based on tier
   */
  private getCompletenessWeights(tier: InvestigationTier): {
    datadog: number;
    gitlab: number;
    database: number;
    sourcegraph: number;
  } {
    switch (tier) {
      case 'tier1':
        return { datadog: 1, gitlab: 0, database: 0, sourcegraph: 0 };
      case 'tier2':
        return { datadog: 0.4, gitlab: 0.6, database: 0, sourcegraph: 0 };
      case 'tier3':
        return { datadog: 0.25, gitlab: 0.35, database: 0.25, sourcegraph: 0.15 };
      default:
        return { datadog: 1, gitlab: 0, database: 0, sourcegraph: 0 };
    }
  }

  /**
   * Extract file path from stack trace
   */
  private extractFilePathFromStackTrace(stackTrace?: string): string | undefined {
    if (!stackTrace) return undefined;

    // Common patterns for file paths in stack traces
    const patterns = [
      /at\s+.*\s+\((.+?):\d+:\d+\)/m, // Node.js: at Function (file.js:10:5)
      /at\s+(.+?):\d+:\d+/m, // Simple: at file.js:10:5
      /File\s+"(.+?)",\s+line\s+\d+/m, // Python: File "file.py", line 10
      /(\S+\.(?:ts|js|py|java|go|rb)):(\d+)/m, // Generic: file.ts:10
    ];

    for (const pattern of patterns) {
      const match = stackTrace.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return undefined;
  }

  /**
   * Extract line number from stack trace
   */
  private extractLineNumberFromStackTrace(stackTrace?: string): number | undefined {
    if (!stackTrace) return undefined;

    const patterns = [
      /at\s+.*\s+\(.+?:(\d+):\d+\)/m,
      /at\s+.+?:(\d+):\d+/m,
      /File\s+".+?",\s+line\s+(\d+)/m,
      /\S+\.(?:ts|js|py|java|go|rb):(\d+)/m,
    ];

    for (const pattern of patterns) {
      const match = stackTrace.match(pattern);
      if (match && match[1]) {
        return parseInt(match[1], 10);
      }
    }

    return undefined;
  }
}
