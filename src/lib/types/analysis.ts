import type { ConfidenceLevel, ComplexityLevel } from './common';

export interface IncidentAnalysis {
  incidentId: string;
  summary: string;

  rootCause: RootCauseAnalysis;
  mechanism: string;

  databaseFindings?: DatabaseAnalysis;
  crossRepoImpact?: CrossRepoImpact;

  contributingFactors: string[];
  recommendedActions: RecommendedAction[];

  estimatedComplexity: ComplexityLevel;
  requiresHumanReview: boolean;
  requiresRollback?: boolean;

  metadata: {
    analyzedAt: Date;
    modelUsed: string;
    tokensUsed: {
      input: number;
      output: number;
      total: number;
    };
    durationMs: number;
  };
}

export interface RootCauseAnalysis {
  hypothesis: string;
  confidence: ConfidenceLevel;
  evidence: string[];
  suspectedCommit?: {
    sha: string;
    repository: string;
    reason: string;
  };
}

export interface DatabaseAnalysis {
  schemaIssues: string[];
  dataIssues: string[];
  relevance: ConfidenceLevel;
}

export interface CrossRepoImpact {
  affectedRepositories: number;
  estimatedReferences: number;
  criticalPaths: string[];
}

export interface RecommendedAction {
  priority: number;
  action: string;
  reasoning: string;
  estimatedImpact: string;
}

export interface LLMUsageRecord {
  id: string;
  incidentId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  modelName: string;
  requestDurationMs: number;
  estimatedCostUsd: number;
  createdAt: Date;
}
