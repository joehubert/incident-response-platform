import type { AggregatedEvidence } from '../../src/lib/types/evidence';
import type { IncidentAnalysis } from '../../src/lib/types/analysis';

export const mockEvidence: AggregatedEvidence = {
  incidentId: 'test-incident-1',
  collectedAt: new Date('2026-01-14T10:01:00Z'),
  investigationTier: 'tier2',
  gitlab: {
    commits: [
      {
        sha: 'abc123',
        shortSha: 'abc123',
        message: 'Fix database connection handling',
        author: 'John Doe',
        authorEmail: 'john@example.com',
        timestamp: new Date('2026-01-14T09:30:00Z'),
        webUrl: 'https://gitlab.com/repo/commit/abc123',
        diff: {
          additions: 15,
          deletions: 5,
          changedFiles: ['src/db/connection.ts'],
        },
        score: {
          total: 85,
          temporal: 30,
          codeRisk: 25,
          messageRelevance: 15,
          fileRelevance: 15,
        },
      },
    ],
    mergeRequests: [],
    pipelines: [],
  },
  sourcegraph: {
    codeMatches: [
      {
        repository: 'test/repo',
        filePath: 'src/db/connection.ts',
        lineNumber: 42,
        content: 'await pool.connect()',
        url: 'https://sourcegraph.com/test/repo/-/blob/src/db/connection.ts#L42',
      },
    ],
    symbolMatches: [],
  },
  datadog: {
    relatedErrors: [],
    deploymentEvents: [],
    metrics: [],
  },
  database: {
    recentChanges: [],
    dataQualityIssues: [],
    schemaInfo: null,
  },
  summary: {
    totalCommits: 1,
    topCommit: {
      sha: 'abc123',
      score: 85,
      message: 'Fix database connection handling',
    },
    codeSearchHits: 1,
    databaseIssues: 0,
    investigationDurationMs: 5000,
  },
};

export const mockAnalysis: IncidentAnalysis = {
  incidentId: 'test-incident-1',
  summary:
    'Database connection pool exhaustion caused by recent changes to connection handling logic.',
  rootCause: {
    hypothesis:
      'The recent commit modified connection timeout settings, causing connections to not be properly released back to the pool.',
    confidence: 'high',
    evidence: [
      'Commit abc123 modified connection.ts with changes to pool configuration',
      'Error rate spiked 30 minutes after deployment',
      'Stack traces show connection timeout errors',
    ],
  },
  mechanism:
    'Connections are not being returned to the pool due to missing cleanup in error handling paths.',
  contributingFactors: [
    {
      factor: 'High traffic load',
      impact: 'medium',
      description: 'Traffic was 20% higher than baseline during the incident window',
    },
  ],
  recommendedActions: [
    {
      action: 'Add connection cleanup in error handlers',
      priority: 'high',
      rationale: 'Prevents connection leaks during error scenarios',
    },
    {
      action: 'Add connection pool monitoring',
      priority: 'medium',
      rationale: 'Early detection of pool exhaustion issues',
    },
  ],
  estimatedComplexity: 'medium',
  requiresHumanReview: false,
  metadata: {
    analyzedAt: new Date('2026-01-14T10:02:00Z'),
    modelUsed: 'gemini-1.5-pro',
    tokensUsed: {
      input: 1500,
      output: 800,
      total: 2300,
    },
    durationMs: 3500,
  },
};
