import { config } from '../../config';
import logger from '../../lib/utils/logger';
import { GitLabClient } from '../../lib/clients/gitlab';
import { SourcegraphClient } from '../../lib/clients/sourcegraph';
import {
  DatabaseInvestigationClient,
  InvestigationQuery,
} from '../../lib/clients/database/DatabaseInvestigationClient';
import { RedisClient } from '../../lib/clients/redis';
import { DatadogClient } from '../../lib/clients/datadog';
import type { Incident, MonitorConfig } from '../../lib/types/incident';
import type { DatadogContext } from '../../lib/types/evidence';
import type { GitLabCommitDiff } from '../../lib/clients/gitlab/types';
import { CommitScorer } from './CommitScorer';
import { TierStrategySelector } from './TierStrategySelector';
import { EvidenceAggregator, AggregationInput } from './EvidenceAggregator';
import type {
  InvestigationRequest,
  InvestigationResult,
  TierStrategy,
  CommitScoringInput,
  CommitScoringContext,
  ScoredCommit,
  EvidenceCollectionError,
} from './types';
import {
  investigationDuration,
  investigationTierUsed,
  evidenceCompleteness,
} from '../../lib/utils/metrics';

export class InvestigationService {
  private readonly gitlab: GitLabClient;
  private readonly sourcegraph: SourcegraphClient;
  private readonly dbInvestigation: DatabaseInvestigationClient;
  private readonly commitScorer: CommitScorer;
  private readonly tierSelector: TierStrategySelector;
  private readonly evidenceAggregator: EvidenceAggregator;

  constructor(
    redis: RedisClient,
    _datadog: DatadogClient // Reserved for future Datadog metric history fetching
  ) {
    this.gitlab = new GitLabClient(redis);
    this.sourcegraph = new SourcegraphClient(redis);
    this.dbInvestigation = new DatabaseInvestigationClient();
    this.commitScorer = new CommitScorer(config.investigation.recentDeploymentWindowHours);
    this.tierSelector = new TierStrategySelector();
    this.evidenceAggregator = new EvidenceAggregator();
  }

  /**
   * Initialize the investigation service
   */
  async initialize(): Promise<void> {
    if (config.database.readOnlyInvestigation?.enabled) {
      await this.dbInvestigation.connect();
    }
    logger.info('Investigation service initialized');
  }

  /**
   * Perform investigation for an incident
   */
  async investigate(request: InvestigationRequest): Promise<InvestigationResult> {
    const startTime = Date.now();
    const { incident, monitorConfig } = request;
    const errors: EvidenceCollectionError[] = [];

    logger.info('Starting investigation', {
      incidentId: incident.id,
      severity: incident.severity,
    });

    try {
      // Select initial tier
      let tier = this.tierSelector.selectTier(incident, monitorConfig);
      let strategy = this.tierSelector.getStrategy(tier, monitorConfig);

      // Collect Datadog context first (may influence tier)
      const datadogContext = await this.collectDatadogContext(incident, errors);

      // Refine tier based on Datadog context
      if (datadogContext?.deploymentEvent) {
        tier = this.tierSelector.refineTier(tier, true, monitorConfig);
        strategy = this.tierSelector.getStrategy(tier, monitorConfig);
      }

      // Collect evidence based on strategy
      const aggregationInput = await this.collectEvidence(
        incident,
        monitorConfig,
        strategy,
        datadogContext,
        errors
      );

      // Aggregate evidence
      const evidenceBundle = this.evidenceAggregator.aggregate(aggregationInput);

      const durationMs = Date.now() - startTime;

      // Record metrics
      investigationDuration.observe({ tier }, durationMs / 1000);
      investigationTierUsed.inc({ tier });
      evidenceCompleteness.observe({ tier }, evidenceBundle.completeness);

      logger.info('Investigation completed', {
        incidentId: incident.id,
        tier,
        durationMs,
        completeness: evidenceBundle.completeness,
        errors: errors.length,
      });

      return {
        incidentId: incident.id,
        evidenceBundle,
        investigationDurationMs: durationMs,
        tierUsed: tier,
        completeness: evidenceBundle.completeness,
        errors,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      logger.error('Investigation failed', {
        incidentId: incident.id,
        durationMs,
        error: error instanceof Error ? error.message : String(error),
      });

      // Return partial results with error
      return {
        incidentId: incident.id,
        evidenceBundle: {
          incidentId: incident.id,
          investigationTier: 'tier1',
          completeness: 0,
          collectedAt: new Date(),
          datadogContext: {
            metricHistory: [],
          },
          warnings: [
            `Investigation failed: ${error instanceof Error ? error.message : String(error)}`,
          ],
        },
        investigationDurationMs: durationMs,
        tierUsed: 'tier1',
        completeness: 0,
        errors: [
          ...errors,
          {
            source: 'datadog',
            error: error instanceof Error ? error.message : String(error),
            recoverable: false,
          },
        ],
      };
    }
  }

  /**
   * Collect Datadog context for the incident
   */
  private async collectDatadogContext(
    incident: Incident,
    errors: EvidenceCollectionError[]
  ): Promise<DatadogContext | undefined> {
    try {
      const context: DatadogContext = {
        metricHistory: [],
      };

      // Add error details from incident
      if (incident.errorMessage || incident.stackTrace) {
        context.errorDetails = {
          errorMessage: incident.errorMessage || 'Unknown error',
          stackTrace: incident.stackTrace || '',
        };
      }

      // TODO: Fetch recent metric history from Datadog
      // TODO: Check for recent deployment events

      return context;
    } catch (error) {
      logger.warn('Failed to collect Datadog context', {
        incidentId: incident.id,
        error: error instanceof Error ? error.message : String(error),
      });
      errors.push({
        source: 'datadog',
        error: error instanceof Error ? error.message : String(error),
        recoverable: true,
      });
      return undefined;
    }
  }

  /**
   * Collect evidence based on strategy
   */
  private async collectEvidence(
    incident: Incident,
    monitorConfig: MonitorConfig,
    strategy: TierStrategy,
    datadogContext: DatadogContext | undefined,
    errors: EvidenceCollectionError[]
  ): Promise<AggregationInput> {
    const input: AggregationInput = {
      incident,
      tier: strategy.tier,
      datadogContext,
      errors,
    };

    // Collect GitLab context
    if (strategy.collectGitLabContext) {
      const gitlabResult = await this.collectGitLabContext(
        incident,
        monitorConfig,
        strategy,
        datadogContext,
        errors
      );
      input.gitlabCommits = gitlabResult.commits;
      input.gitlabDiffs = gitlabResult.diffs;
      input.gitlabPipelines = gitlabResult.pipelines;
      input.gitlabMergeRequests = gitlabResult.mergeRequests;
    }

    // Collect database context
    if (strategy.collectDatabaseContext && monitorConfig.databaseContext) {
      input.databaseResults = await this.collectDatabaseContext(incident, monitorConfig, errors);
    }

    // Collect Sourcegraph context
    if (strategy.collectSourcegraphContext && datadogContext?.errorDetails) {
      input.sourcegraphResults = await this.collectSourcegraphContext(
        datadogContext,
        monitorConfig,
        errors
      );
    }

    return input;
  }

  /**
   * Collect GitLab commit context
   */
  private async collectGitLabContext(
    incident: Incident,
    monitorConfig: MonitorConfig,
    strategy: TierStrategy,
    datadogContext: DatadogContext | undefined,
    errors: EvidenceCollectionError[]
  ): Promise<{
    commits: ScoredCommit[];
    diffs: Map<string, GitLabCommitDiff>;
    pipelines: Map<string, { status: string; url: string }>;
    mergeRequests: Map<string, { id: number; title: string; url: string }>;
  }> {
    const allCommits: ScoredCommit[] = [];
    const diffs = new Map<string, GitLabCommitDiff>();
    const pipelines = new Map<string, { status: string; url: string }>();
    const mergeRequests = new Map<string, { id: number; title: string; url: string }>();

    const scoringContext: CommitScoringContext = {
      incidentDetectedAt: incident.detectedAt,
      deploymentCommitSha: datadogContext?.deploymentEvent?.commitSha,
      stackTraceFilePath: datadogContext?.errorDetails?.filePath,
      recentDeploymentWindow: config.investigation.recentDeploymentWindowHours * 60 * 60 * 1000,
    };

    for (const repository of monitorConfig.gitlabRepositories) {
      try {
        // Fetch recent commits
        const since = new Date(
          incident.detectedAt.getTime() - scoringContext.recentDeploymentWindow
        );
        const commits = await this.gitlab.getCommits({
          repository,
          since,
          until: incident.detectedAt,
          perPage: strategy.maxCommitsToAnalyze,
        });

        // Convert to scoring input
        const scoringInputs: CommitScoringInput[] = commits.map((c) => ({
          sha: c.sha,
          message: c.message,
          author: c.author,
          timestamp: c.committedDate,
          repository,
          filesChanged: [], // Will be populated from diff
          additions: c.stats?.additions || 0,
          deletions: c.stats?.deletions || 0,
        }));

        // Fetch diffs if needed
        if (strategy.includeCommitDiffs) {
          for (const commit of commits.slice(0, 10)) {
            try {
              const diff = await this.gitlab.getCommitDiff(repository, commit.sha);
              diffs.set(commit.sha, diff);

              // Update files changed
              const input = scoringInputs.find((i) => i.sha === commit.sha);
              if (input) {
                input.filesChanged = diff.files.map((f) => f.newPath);
              }
            } catch {
              // Non-critical error
            }
          }
        }

        // Score commits
        const scored = this.commitScorer.scoreCommits(scoringInputs, scoringContext);
        allCommits.push(...scored);

        // Fetch additional context for top commits
        for (const commit of scored.slice(0, 5)) {
          try {
            const pipeline = await this.gitlab.getPipelineForCommit(repository, commit.sha);
            if (pipeline) {
              pipelines.set(commit.sha, { status: pipeline.status, url: pipeline.webUrl });
            }
          } catch {
            // Non-critical
          }

          try {
            const mr = await this.gitlab.getMergeRequestForCommit(repository, commit.sha);
            if (mr) {
              mergeRequests.set(commit.sha, { id: mr.iid, title: mr.title, url: mr.webUrl });
            }
          } catch {
            // Non-critical
          }
        }
      } catch (error) {
        logger.warn('Failed to collect GitLab context for repository', {
          repository,
          error: error instanceof Error ? error.message : String(error),
        });
        errors.push({
          source: 'gitlab',
          error: `Repository ${repository}: ${error instanceof Error ? error.message : String(error)}`,
          recoverable: true,
        });
      }
    }

    // Sort all commits by score
    allCommits.sort((a, b) => b.score.combined - a.score.combined);

    return {
      commits: allCommits.slice(0, strategy.maxCommitsToAnalyze),
      diffs,
      pipelines,
      mergeRequests,
    };
  }

  /**
   * Collect database investigation context
   */
  private async collectDatabaseContext(
    incident: Incident,
    monitorConfig: MonitorConfig,
    errors: EvidenceCollectionError[]
  ) {
    try {
      if (!monitorConfig.databaseContext) {
        return undefined;
      }

      const query: InvestigationQuery = {
        tables: monitorConfig.databaseContext.relevantTables,
        schemas: monitorConfig.databaseContext.relevantSchemas,
        errorContext: incident.errorMessage
          ? {
              errorMessage: incident.errorMessage,
              stackTrace: incident.stackTrace || '',
            }
          : undefined,
      };

      return await this.dbInvestigation.investigate(query);
    } catch (error) {
      logger.warn('Failed to collect database context', {
        incidentId: incident.id,
        error: error instanceof Error ? error.message : String(error),
      });
      errors.push({
        source: 'database',
        error: error instanceof Error ? error.message : String(error),
        recoverable: true,
      });
      return undefined;
    }
  }

  /**
   * Collect Sourcegraph cross-repository context
   */
  private async collectSourcegraphContext(
    datadogContext: DatadogContext,
    monitorConfig: MonitorConfig,
    errors: EvidenceCollectionError[]
  ) {
    try {
      if (!datadogContext.errorDetails?.errorMessage) {
        return undefined;
      }

      // Extract key terms from error message for search
      const searchPattern = this.extractSearchPattern(datadogContext.errorDetails.errorMessage);

      if (!searchPattern) {
        return undefined;
      }

      return await this.sourcegraph.search({
        pattern: searchPattern,
        repositories: monitorConfig.gitlabRepositories,
        excludeTests: true,
      });
    } catch (error) {
      logger.warn('Failed to collect Sourcegraph context', {
        error: error instanceof Error ? error.message : String(error),
      });
      errors.push({
        source: 'sourcegraph',
        error: error instanceof Error ? error.message : String(error),
        recoverable: true,
      });
      return undefined;
    }
  }

  /**
   * Extract a search pattern from an error message
   */
  private extractSearchPattern(errorMessage: string): string | null {
    // Extract function names or class names from error
    const patterns = [
      /(\w+Error):/i,
      /at (\w+)\./i,
      /function (\w+)/i,
      /class (\w+)/i,
      /method (\w+)/i,
    ];

    for (const pattern of patterns) {
      const match = errorMessage.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    // Fall back to first significant word
    const words = errorMessage.split(/\s+/).filter((w) => w.length > 5);
    return words[0] || null;
  }

  /**
   * Shutdown the investigation service
   */
  async shutdown(): Promise<void> {
    await this.dbInvestigation.disconnect();
    logger.info('Investigation service shutdown');
  }
}
