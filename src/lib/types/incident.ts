import type { Severity, IncidentStatus, InvestigationTier, Threshold } from './common';

export interface Incident {
  id: string;
  externalId: string;
  monitorId: string;
  serviceName: string;
  severity: Severity;
  status: IncidentStatus;
  investigationTier: InvestigationTier;

  // Metric details
  metricName: string;
  metricValue: number;
  baselineValue: number;
  thresholdValue: number;
  deviationPercentage: number;

  // Error context
  errorMessage?: string;
  stackTrace?: string;

  // Timestamps
  detectedAt: Date;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;

  // Metadata
  tags: string[];
}

export interface IncidentCreateInput {
  monitorId: string;
  serviceName: string;
  severity: Severity;
  metricName: string;
  metricValue: number;
  baselineValue: number;
  thresholdValue: number;
  errorMessage?: string;
  stackTrace?: string;
  tags?: string[];
}

export interface MonitorConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;

  // Queries
  queries: {
    metric: string;
    errorTracking?: string;
    deployment?: string;
  };

  // Detection settings
  checkIntervalSeconds: number;
  threshold: Threshold;
  timeWindow: string;

  // Investigation settings
  gitlabRepositories: string[];
  enableDatabaseInvestigation: boolean;
  databaseContext?: {
    relevantTables: string[];
    relevantSchemas: string[];
  };

  // Notification settings
  teamsNotification: {
    channelWebhookUrl: string;
    mentionUsers?: string[];
    urlPatterns?: {
      datadog?: string;
      gitlab?: string;
      incident?: string;
    };
  };

  // Metadata
  tags: string[];
  severity: Severity;
}

export interface AnomalyDetectionResult {
  isAnomaly: boolean;
  severity: Severity;
  currentValue: number;
  baselineValue: number;
  thresholdValue: number;
  deviationPercentage: number;
  detectedAt: Date;
}
