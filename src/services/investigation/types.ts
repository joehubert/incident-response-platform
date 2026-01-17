import type { InvestigationTier, Severity } from '../../lib/types/common';
import type { CommitScore, EvidenceBundle } from '../../lib/types/evidence';
import type { Incident, MonitorConfig } from '../../lib/types/incident';

/**
 * Investigation service type definitions
 */

export interface InvestigationRequest {
  incident: Incident;
  monitorConfig: MonitorConfig;
}

export interface InvestigationContext {
  incident: Incident;
  monitorConfig: MonitorConfig;
  tier: InvestigationTier;
  startedAt: Date;
}

export interface TierCriteria {
  hasStackTrace: boolean;
  hasDeploymentEvent: boolean;
  severity: Severity;
  hasGitLabConfig: boolean;
  hasDatabaseConfig: boolean;
}

export interface TierStrategy {
  tier: InvestigationTier;
  collectGitLabContext: boolean;
  collectDatabaseContext: boolean;
  collectSourcegraphContext: boolean;
  maxCommitsToAnalyze: number;
  includeCommitDiffs: boolean;
}

export interface CommitScoringInput {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
  };
  timestamp: Date;
  repository: string;
  filesChanged: string[];
  additions: number;
  deletions: number;
}

export interface CommitScoringContext {
  incidentDetectedAt: Date;
  deploymentCommitSha?: string;
  stackTraceFilePath?: string;
  recentDeploymentWindow: number; // milliseconds
}

export interface ScoredCommit extends CommitScoringInput {
  score: CommitScore;
  scoringFactors: ScoringFactor[];
}

export interface ScoringFactor {
  name: string;
  weight: number;
  value: number;
  contribution: number;
  reason: string;
}

export interface EvidenceCollectionResult {
  bundle: EvidenceBundle;
  collectionDurationMs: number;
  errors: EvidenceCollectionError[];
}

export interface EvidenceCollectionError {
  source: 'gitlab' | 'database' | 'sourcegraph' | 'datadog';
  error: string;
  recoverable: boolean;
}

export interface InvestigationResult {
  incidentId: string;
  evidenceBundle: EvidenceBundle;
  investigationDurationMs: number;
  tierUsed: InvestigationTier;
  completeness: number;
  errors: EvidenceCollectionError[];
}
