import type { InvestigationTier, ConfidenceLevel } from './common';

export interface EvidenceBundle {
  incidentId: string;
  investigationTier: InvestigationTier;
  completeness: number; // 0-1 scale
  collectedAt: Date;

  datadogContext: DatadogContext;
  gitlabContext?: GitLabContext;
  databaseContext?: DatabaseContext;
  sourcegraphContext?: SourcegraphContext;

  warnings?: string[];
}

export interface DatadogContext {
  errorDetails?: {
    errorMessage: string;
    stackTrace: string;
    filePath?: string;
    lineNumber?: number;
  };
  deploymentEvent?: {
    commitSha: string;
    repository: string;
    timestamp: Date;
  };
  metricHistory: Array<{
    timestamp: Date;
    value: number;
  }>;
}

export interface GitLabContext {
  commits: CommitInfo[];
  scoringMethod: 'deployment' | 'stack-trace' | 'temporal';
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
  };
  timestamp: Date;
  repository: string;

  // Diff information
  diff?: string;
  filesChanged: string[];
  additions: number;
  deletions: number;

  // Scoring
  score: CommitScore;

  // Additional context
  mergeRequest?: {
    id: number;
    title: string;
    url: string;
  };
  pipeline?: {
    status: 'success' | 'failed' | 'running' | 'canceled';
    url: string;
  };
}

export interface CommitScore {
  temporal: number; // 0-1 scale based on time proximity
  risk: number; // 0-1 scale based on risk factors
  combined: number; // weighted combination
}

export interface DatabaseContext {
  schemaFindings: SchemaFinding[];
  dataFindings: DataFinding[];
  performanceFindings: PerformanceFinding[];
  relevance: ConfidenceLevel;
}

export interface SchemaFinding {
  type: 'missing_column' | 'missing_table' | 'type_mismatch' | 'constraint_violation';
  severity: ConfidenceLevel;
  description: string;
  tableName: string;
  columnName?: string;
  expected?: string;
  actual?: string;
}

export interface DataFinding {
  type: 'unexpected_nulls' | 'missing_fk_references' | 'duplicate_keys' | 'invalid_data';
  severity: ConfidenceLevel;
  description: string;
  tableName: string;
  affectedRows: number;
  sampleData?: unknown[];
}

export interface PerformanceFinding {
  type: 'missing_index' | 'slow_query' | 'table_scan' | 'lock_contention';
  severity: ConfidenceLevel;
  description: string;
  recommendation: string;
  estimatedImpact?: string;
}

export interface SourcegraphContext {
  affectedRepositories: number;
  estimatedReferences: number;
  criticalPaths: string[];
  matches: SourcegraphMatch[];
}

export interface SourcegraphMatch {
  repository: string;
  filePath: string;
  lineNumber: number;
  preview: string;
  matchCount: number;
}
