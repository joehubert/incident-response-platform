import { EvidenceAggregator, AggregationInput } from '../../../../src/services/investigation/EvidenceAggregator';
import type { Incident } from '../../../../src/lib/types/incident';
import type { DatadogContext } from '../../../../src/lib/types/evidence';
import type { ScoredCommit } from '../../../../src/services/investigation/types';

describe('EvidenceAggregator', () => {
  let aggregator: EvidenceAggregator;

  beforeEach(() => {
    aggregator = new EvidenceAggregator();
  });

  const createIncident = (overrides: Partial<Incident> = {}): Incident => ({
    id: 'inc-123',
    externalId: 'ext-123',
    monitorId: 'mon-123',
    serviceName: 'test-service',
    severity: 'high',
    status: 'active',
    investigationTier: 'tier2',
    metricName: 'error_rate',
    metricValue: 100,
    baselineValue: 10,
    thresholdValue: 50,
    deviationPercentage: 900,
    detectedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: [],
    ...overrides,
  });

  const createScoredCommit = (overrides: Partial<ScoredCommit> = {}): ScoredCommit => ({
    sha: 'abc123',
    message: 'fix: resolve error',
    author: { name: 'Test User', email: 'test@example.com' },
    timestamp: new Date(),
    repository: 'org/repo',
    filesChanged: ['src/index.ts'],
    additions: 50,
    deletions: 10,
    score: { temporal: 0.8, risk: 0.6, combined: 0.68 },
    scoringFactors: [],
    ...overrides,
  });

  describe('aggregate', () => {
    it('should create basic evidence bundle for tier1', () => {
      const input: AggregationInput = {
        incident: createIncident(),
        tier: 'tier1',
        errors: [],
      };

      const bundle = aggregator.aggregate(input);

      expect(bundle.incidentId).toBe('inc-123');
      expect(bundle.investigationTier).toBe('tier1');
      expect(bundle.datadogContext).toBeDefined();
      expect(bundle.gitlabContext).toBeUndefined();
      expect(bundle.databaseContext).toBeUndefined();
      expect(bundle.sourcegraphContext).toBeUndefined();
    });

    it('should include GitLab context when commits provided', () => {
      const commits = [
        createScoredCommit({ sha: 'commit1' }),
        createScoredCommit({ sha: 'commit2' }),
      ];

      const input: AggregationInput = {
        incident: createIncident(),
        tier: 'tier2',
        gitlabCommits: commits,
        errors: [],
      };

      const bundle = aggregator.aggregate(input);

      expect(bundle.gitlabContext).toBeDefined();
      expect(bundle.gitlabContext?.commits).toHaveLength(2);
      expect(bundle.gitlabContext?.commits[0].sha).toBe('commit1');
    });

    it('should include database context when results provided', () => {
      const input: AggregationInput = {
        incident: createIncident(),
        tier: 'tier3',
        databaseResults: {
          schemaFindings: [
            {
              type: 'constraint_violation',
              severity: 'medium',
              description: 'Column allows NULL',
              tableName: 'users',
              columnName: 'email',
            },
          ],
          dataFindings: [],
          performanceFindings: [],
        },
        errors: [],
      };

      const bundle = aggregator.aggregate(input);

      expect(bundle.databaseContext).toBeDefined();
      expect(bundle.databaseContext?.schemaFindings).toHaveLength(1);
      expect(bundle.databaseContext?.relevance).toBe('low');
    });

    it('should set high relevance for high severity findings', () => {
      const input: AggregationInput = {
        incident: createIncident(),
        tier: 'tier3',
        databaseResults: {
          schemaFindings: [
            {
              type: 'missing_table',
              severity: 'high',
              description: 'Table missing',
              tableName: 'orders',
            },
          ],
          dataFindings: [],
          performanceFindings: [],
        },
        errors: [],
      };

      const bundle = aggregator.aggregate(input);

      expect(bundle.databaseContext?.relevance).toBe('high');
    });

    it('should include sourcegraph context when results provided', () => {
      const input: AggregationInput = {
        incident: createIncident(),
        tier: 'tier3',
        sourcegraphResults: {
          affectedRepositories: 3,
          totalMatchCount: 15,
          criticalPaths: ['org/repo:src/service.ts'],
          matches: [
            {
              repository: 'org/repo',
              filePath: 'src/service.ts',
              lineNumber: 42,
              preview: 'throw new Error("Not found")',
              matchCount: 1,
            },
          ],
        },
        errors: [],
      };

      const bundle = aggregator.aggregate(input);

      expect(bundle.sourcegraphContext).toBeDefined();
      expect(bundle.sourcegraphContext?.affectedRepositories).toBe(3);
      expect(bundle.sourcegraphContext?.matches).toHaveLength(1);
    });

    it('should add warnings from recoverable errors', () => {
      const input: AggregationInput = {
        incident: createIncident(),
        tier: 'tier2',
        errors: [
          { source: 'gitlab', error: 'Rate limited', recoverable: true },
          { source: 'database', error: 'Connection failed', recoverable: false },
        ],
      };

      const bundle = aggregator.aggregate(input);

      expect(bundle.warnings).toHaveLength(1);
      expect(bundle.warnings?.[0]).toContain('gitlab');
      expect(bundle.warnings?.[0]).toContain('Rate limited');
    });
  });

  describe('completeness calculation', () => {
    it('should calculate 100% completeness for tier1 with Datadog context', () => {
      const input: AggregationInput = {
        incident: createIncident(),
        tier: 'tier1',
        datadogContext: {
          metricHistory: [],
          errorDetails: {
            errorMessage: 'Error',
            stackTrace: 'at file.ts:10',
          },
        },
        errors: [],
      };

      const bundle = aggregator.aggregate(input);

      // Should be > 1 due to bonus, capped at 1
      expect(bundle.completeness).toBe(1);
    });

    it('should calculate partial completeness for tier2 without GitLab', () => {
      const input: AggregationInput = {
        incident: createIncident(),
        tier: 'tier2',
        datadogContext: { metricHistory: [] },
        errors: [],
      };

      const bundle = aggregator.aggregate(input);

      // Only Datadog context available (40% weight)
      expect(bundle.completeness).toBeLessThan(1);
      expect(bundle.completeness).toBeGreaterThan(0);
    });

    it('should calculate full completeness for tier2 with all context', () => {
      const input: AggregationInput = {
        incident: createIncident(),
        tier: 'tier2',
        datadogContext: { metricHistory: [] },
        gitlabCommits: [createScoredCommit()],
        errors: [],
      };

      const bundle = aggregator.aggregate(input);

      expect(bundle.completeness).toBe(1);
    });

    it('should calculate partial completeness for tier3 with missing sources', () => {
      const input: AggregationInput = {
        incident: createIncident(),
        tier: 'tier3',
        datadogContext: { metricHistory: [] },
        gitlabCommits: [createScoredCommit()],
        // Missing database and sourcegraph
        errors: [],
      };

      const bundle = aggregator.aggregate(input);

      // Datadog (25%) + GitLab (35%) = 60%
      expect(bundle.completeness).toBeLessThan(1);
      expect(bundle.completeness).toBeGreaterThan(0.5);
    });
  });

  describe('datadog context building', () => {
    it('should extract error details from incident', () => {
      const incident = createIncident({
        errorMessage: 'NullPointerException',
        stackTrace: 'at com.example.Service.process(Service.java:42)',
      });

      const input: AggregationInput = {
        incident,
        tier: 'tier1',
        errors: [],
      };

      const bundle = aggregator.aggregate(input);

      expect(bundle.datadogContext?.errorDetails?.errorMessage).toBe('NullPointerException');
      expect(bundle.datadogContext?.errorDetails?.stackTrace).toContain('Service.java');
    });

    it('should use provided datadog context over default', () => {
      const customContext: DatadogContext = {
        metricHistory: [{ timestamp: new Date(), value: 100 }],
        errorDetails: {
          errorMessage: 'Custom error',
          stackTrace: 'custom trace',
          filePath: 'custom/path.ts',
          lineNumber: 99,
        },
      };

      const input: AggregationInput = {
        incident: createIncident(),
        tier: 'tier1',
        datadogContext: customContext,
        errors: [],
      };

      const bundle = aggregator.aggregate(input);

      expect(bundle.datadogContext?.errorDetails?.errorMessage).toBe('Custom error');
      expect(bundle.datadogContext?.errorDetails?.lineNumber).toBe(99);
    });
  });

  describe('gitlab context building', () => {
    it('should determine scoring method as deployment when deployment event exists', () => {
      const input: AggregationInput = {
        incident: createIncident(),
        tier: 'tier2',
        datadogContext: {
          metricHistory: [],
          deploymentEvent: {
            commitSha: 'deploy123',
            repository: 'org/repo',
            timestamp: new Date(),
          },
        },
        gitlabCommits: [createScoredCommit()],
        errors: [],
      };

      const bundle = aggregator.aggregate(input);

      expect(bundle.gitlabContext?.scoringMethod).toBe('deployment');
    });

    it('should determine scoring method as stack-trace when stack trace exists', () => {
      const input: AggregationInput = {
        incident: createIncident(),
        tier: 'tier2',
        datadogContext: {
          metricHistory: [],
          errorDetails: {
            errorMessage: 'Error',
            stackTrace: 'at file.ts:10',
          },
        },
        gitlabCommits: [createScoredCommit()],
        errors: [],
      };

      const bundle = aggregator.aggregate(input);

      expect(bundle.gitlabContext?.scoringMethod).toBe('stack-trace');
    });

    it('should include commit diffs when provided', () => {
      const diffs = new Map();
      diffs.set('abc123', {
        commitSha: 'abc123',
        files: [
          {
            oldPath: 'src/index.ts',
            newPath: 'src/index.ts',
            diff: '+console.log("debug")',
            newFile: false,
            renamedFile: false,
            deletedFile: false,
          },
        ],
      });

      const input: AggregationInput = {
        incident: createIncident(),
        tier: 'tier2',
        gitlabCommits: [createScoredCommit({ sha: 'abc123' })],
        gitlabDiffs: diffs,
        errors: [],
      };

      const bundle = aggregator.aggregate(input);

      expect(bundle.gitlabContext?.commits[0].diff).toContain('console.log');
    });

    it('should include pipeline and MR info when provided', () => {
      const pipelines = new Map();
      pipelines.set('abc123', { status: 'success', url: 'https://gitlab.com/pipeline/1' });

      const mergeRequests = new Map();
      mergeRequests.set('abc123', { id: 42, title: 'Fix bug', url: 'https://gitlab.com/mr/42' });

      const input: AggregationInput = {
        incident: createIncident(),
        tier: 'tier2',
        gitlabCommits: [createScoredCommit({ sha: 'abc123' })],
        gitlabPipelines: pipelines,
        gitlabMergeRequests: mergeRequests,
        errors: [],
      };

      const bundle = aggregator.aggregate(input);

      expect(bundle.gitlabContext?.commits[0].pipeline?.status).toBe('success');
      expect(bundle.gitlabContext?.commits[0].mergeRequest?.id).toBe(42);
    });
  });
});
