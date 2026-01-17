
---

## 7. Tier Strategy Selector

### 7.1 src/services/investigation/TierStrategySelector.ts (REQUIRED)

```typescript
import logger from '../../lib/utils/logger';
import type { InvestigationTier } from '../../lib/types/common';
import type { Incident } from '../../lib/types/incident';
import type { DatadogContext } from '../../lib/types/evidence';

export class TierStrategySelector {
  /**
   * Determine which investigation tier to use
   */
  selectTier(incident: Incident, datadogContext: DatadogContext): InvestigationTier {
    // Tier 1: Deployment event available
    if (datadogContext.deploymentEvent) {
      logger.info('Selected Tier 1 investigation (deployment event)', {
        incidentId: incident.id,
        commitSha: datadogContext.deploymentEvent.commitSha,
      });
      return 'tier1';
    }

    // Tier 2: Stack trace with file path
    if (datadogContext.errorDetails?.filePath) {
      logger.info('Selected Tier 2 investigation (stack trace)', {
        incidentId: incident.id,
        filePath: datadogContext.errorDetails.filePath,
      });
      return 'tier2';
    }

    // Tier 3: Fallback to temporal correlation
    logger.info('Selected Tier 3 investigation (temporal)', {
      incidentId: incident.id,
    });
    return 'tier3';
  }
}
```

---

## 8. Evidence Aggregator

### 8.1 src/services/investigation/EvidenceAggregator.ts (REQUIRED)

```typescript
import logger from '../../lib/utils/logger';
import type { EvidenceBundle, CommitInfo } from '../../lib/types/evidence';
import type { GitLabCommit, GitLabCommitDiff } from '../../lib/clients/gitlab';
import type { CommitScore } from '../../lib/types/evidence';

export class EvidenceAggregator {
  /**
   * Aggregate evidence into a bundle
   */
  aggregate(data: {
    commits: Array<{ commit: GitLabCommit; score: CommitScore; diff?: GitLabCommitDiff }>;
    databaseContext: any;
    sourcegraphContext: any;
    tier: string;
  }): EvidenceBundle {
    const commitInfos: CommitInfo[] = data.commits.map(({ commit, score, diff }) => ({
      sha: commit.sha,
      message: commit.message,
      author: commit.author,
      timestamp: commit.committedDate,
      repository: commit.repository,
      diff: diff?.files.map(f => f.diff).join('\n\n'),
      filesChanged: diff?.files.map(f => f.newPath) || [],
      additions: commit.stats.additions,
      deletions: commit.stats.deletions,
      score,
    }));

    const completeness = this.calculateCompleteness({
      hasCommits: commitInfos.length > 0,
      hasDatabase: !!data.databaseContext,
      hasSourcegraph: !!data.sourcegraphContext,
    });

    return {
      incidentId: '',
      investigationTier: data.tier as any,
      completeness,
      collectedAt: new Date(),
      datadogContext: {} as any,
      gitlabContext: {
        commits: commitInfos,
        scoringMethod: data.tier === 'tier1' ? 'deployment' : 
                       data.tier === 'tier2' ? 'stack-trace' : 'temporal',
      },
      databaseContext: data.databaseContext,
      sourcegraphContext: data.sourcegraphContext,
    };
  }

  private calculateCompleteness(data: {
    hasCommits: boolean;
    hasDatabase: boolean;
    hasSourcegraph: boolean;
  }): number {
    let score = 0;
    if (data.hasCommits) score += 0.4;
    if (data.hasDatabase) score += 0.3;
    if (data.hasSourcegraph) score += 0.3;
    return score;
  }
}
```

---

## 9. Investigation Service (Main Orchestrator)

### 9.1 src/services/investigation/InvestigationService.ts (REQUIRED - Main Logic)

```typescript
import { GitLabClient } from '../../lib/clients/gitlab';
import { SourcegraphClient } from '../../lib/clients/sourcegraph';
import { DatabaseInvestigationClient } from '../../lib/clients/database';
import { RedisClient } from '../../lib/clients/redis';
import { CommitScorer } from './CommitScorer';
import { TierStrategySelector } from './TierStrategySelector';
import { EvidenceAggregator } from './EvidenceAggregator';
import logger from '../../lib/utils/logger';
import { investigationDuration, investigationTierUsed } from '../../lib/utils/metrics';
import type { Incident, MonitorConfig } from '../../lib/types/incident';
import type { EvidenceBundle, DatadogContext } from '../../lib/types/evidence';

export class InvestigationService {
  private readonly gitlab: GitLabClient;
  private readonly sourcegraph: SourcegraphClient;
  private readonly database: DatabaseInvestigationClient;
  private readonly scorer: CommitScorer;
  private readonly tierSelector: TierStrategySelector;
  private readonly aggregator: EvidenceAggregator;

  constructor(redis: RedisClient) {
    this.gitlab = new GitLabClient(redis);
    this.sourcegraph = new SourcegraphClient(redis);
    this.database = new DatabaseInvestigationClient();
    this.scorer = new CommitScorer();
    this.tierSelector = new TierStrategySelector();
    this.aggregator = new EvidenceAggregator();
  }

  /**
   * Investigate an incident
   */
  async investigate(
    incident: Incident,
    monitor: MonitorConfig,
    datadogContext: DatadogContext
  ): Promise<EvidenceBundle> {
    const timer = investigationDuration.startTimer({ 
      monitor_id: incident.monitorId,
      tier: 'unknown',
    });

    try {
      logger.info('Starting investigation', {
        incidentId: incident.id,
        monitorId: incident.monitorId,
      });

      // Select investigation tier
      const tier = this.tierSelector.selectTier(incident, datadogContext);
      investigationTierUsed.inc({ tier });

      // Execute investigation based on tier
      const [commits, databaseContext, sourcegraphContext] = await Promise.all([
        this.investigateGitLab(incident, monitor, datadogContext, tier),
        monitor.enableDatabaseInvestigation 
          ? this.investigateDatabase(incident, monitor, datadogContext)
          : Promise.resolve(null),
        datadogContext.errorDetails
          ? this.investigateSourcegraph(datadogContext.errorDetails.errorMessage)
          : Promise.resolve(null),
      ]);

      // Aggregate evidence
      const evidence = this.aggregator.aggregate({
        commits,
        databaseContext,
        sourcegraphContext,
        tier,
      });

      timer({ tier });

      logger.info('Investigation completed', {
        incidentId: incident.id,
        tier,
        completeness: evidence.completeness,
      });

      return evidence;
    } catch (error) {
      timer();
      logger.error('Investigation failed', {
        incidentId: incident.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Investigate GitLab commits
   */
  private async investigateGitLab(
    incident: Incident,
    monitor: MonitorConfig,
    datadogContext: DatadogContext,
    tier: string
  ) {
    const results: any[] = [];

    for (const repo of monitor.gitlabRepositories) {
      try {
        let commits;

        if (tier === 'tier1' && datadogContext.deploymentEvent) {
          // Get specific commit
          const commit = await this.gitlab.getCommit(
            repo,
            datadogContext.deploymentEvent.commitSha
          );
          commits = [commit];
        } else if (tier === 'tier2' && datadogContext.errorDetails?.filePath) {
          // Get commits touching specific file
          commits = await this.gitlab.getCommits({
            repository: repo,
            since: new Date(Date.now() - 24 * 60 * 60 * 1000),
            path: datadogContext.errorDetails.filePath,
          });
        } else {
          // Get all recent commits
          commits = await this.gitlab.getCommits({
            repository: repo,
            since: new Date(Date.now() - 24 * 60 * 60 * 1000),
          });
        }

        // Score and get diffs for top commits
        for (const commit of commits.slice(0, 5)) {
          const pipeline = await this.gitlab.getPipelineForCommit(repo, commit.sha);
          const score = this.scorer.calculateScore(commit, incident.detectedAt, pipeline);
          const diff = await this.gitlab.getCommitDiff(repo, commit.sha);

          results.push({ commit, score, diff });
        }
      } catch (error) {
        logger.warn('GitLab investigation failed for repository', {
          repo,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Sort by score
    results.sort((a, b) => b.score.combined - a.score.combined);
    return results.slice(0, 5);
  }

  /**
   * Investigate database
   */
  private async investigateDatabase(
    incident: Incident,
    monitor: MonitorConfig,
    datadogContext: DatadogContext
  ) {
    if (!monitor.databaseContext) {
      return null;
    }

    try {
      await this.database.connect();

      const result = await this.database.investigate({
        tables: monitor.databaseContext.relevantTables,
        schemas: monitor.databaseContext.relevantSchemas,
        errorContext: datadogContext.errorDetails ? {
          errorMessage: datadogContext.errorDetails.errorMessage,
          stackTrace: datadogContext.errorDetails.stackTrace,
        } : undefined,
      });

      await this.database.disconnect();

      return {
        schemaFindings: result.schemaFindings.map(f => f.description),
        dataFindings: result.dataFindings.map(f => f.description),
        relevance: result.schemaFindings.length > 0 || result.dataFindings.length > 0 
          ? 'high' as const 
          : 'low' as const,
      };
    } catch (error) {
      logger.warn('Database investigation failed (non-critical)', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Investigate Sourcegraph
   */
  private async investigateSourcegraph(errorMessage: string) {
    try {
      const result = await this.sourcegraph.search({
        pattern: errorMessage,
        excludeTests: true,
      });

      return {
        affectedRepositories: result.affectedRepositories,
        estimatedReferences: result.totalMatchCount,
        criticalPaths: result.criticalPaths,
        matches: result.matches,
      };
    } catch (error) {
      logger.warn('Sourcegraph investigation failed (non-critical)', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
```

### 9.2 src/services/investigation/index.ts (REQUIRED)

```typescript
export { InvestigationService } from './InvestigationService';
export type * from './types';
```

---

## 10. Integration Tests

### 10.1 tests/integration/services/investigation/InvestigationService.integration.test.ts

```typescript
import { InvestigationService } from '../../../../src/services/investigation';
import { RedisClient } from '../../../../src/lib/clients/redis';

describe('InvestigationService Integration', () => {
  let service: InvestigationService;
  let redis: RedisClient;

  beforeAll(async () => {
    redis = new RedisClient();
    await redis.connect();
    service = new InvestigationService(redis);
  });

  afterAll(async () => {
    await redis.disconnect();
  });

  it('should complete tier 3 investigation', async () => {
    // Test with mock incident
    const incident = {
      id: 'test-1',
      monitorId: 'test-monitor',
      detectedAt: new Date(),
    } as any;

    const monitor = {
      gitlabRepositories: ['myorg/test-repo'],
      enableDatabaseInvestigation: false,
    } as any;

    const datadogContext = {
      metricHistory: [],
    } as any;

    const result = await service.investigate(incident, monitor, datadogContext);
    
    expect(result).toBeDefined();
    expect(result.investigationTier).toBe('tier3');
  }, 30000);
});
```

---

## 11. Implementation Checklist

After Claude Code generates:

- ✅ GitLabClient with all methods
- ✅ SourcegraphClient with GraphQL
- ✅ DatabaseInvestigationClient with security controls
- ✅ CommitScorer with temporal and risk scoring
- ✅ TierStrategySelector for tier determination
- ✅ EvidenceAggregator for bundling
- ✅ InvestigationService main orchestrator
- ✅ Integration tests

---

**End of Document 03**
