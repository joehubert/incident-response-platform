import type { ConfidenceLevel, ComplexityLevel } from '../../lib/types/common';

/**
 * Raw analysis response from LLM before transformation
 */
export interface RawAnalysisResponse {
  summary: string;
  rootCause: {
    hypothesis: string;
    confidence: ConfidenceLevel;
    evidence: string[];
    suspectedCommit?: {
      sha: string;
      repository: string;
      reason: string;
    };
  };
  mechanism: string;
  databaseFindings?: {
    schemaIssues: string[];
    dataIssues: string[];
    relevance: ConfidenceLevel;
  };
  crossRepoImpact?: {
    affectedRepositories: number;
    estimatedReferences: number;
    criticalPaths: string[];
  };
  contributingFactors: string[];
  recommendedActions: Array<{
    priority: number;
    action: string;
    reasoning: string;
    estimatedImpact: string;
  }>;
  estimatedComplexity: ComplexityLevel;
  requiresHumanReview: boolean;
  requiresRollback?: boolean;
}

/**
 * Input for LLM usage tracking
 */
export interface LLMUsageInput {
  incidentId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  modelName: string;
  requestDurationMs: number;
  estimatedCostUsd: number;
}

/**
 * Analysis cache entry
 */
export interface AnalysisCacheEntry {
  analysis: RawAnalysisResponse;
  cachedAt: Date;
  expiresAt: Date;
}
