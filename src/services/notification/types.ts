import type { Incident, MonitorConfig } from '../../lib/types/incident';
import type { IncidentAnalysis } from '../../lib/types/analysis';

/**
 * Notification request
 */
export interface NotificationRequest {
  incident: Incident;
  analysis: IncidentAnalysis;
  monitor: MonitorConfig;
}

/**
 * Notification result
 */
export interface NotificationResult {
  success: boolean;
  channelUsed: 'webhook' | 'graph';
  messageId?: string;
  error?: string;
}

/**
 * URL variables for interpolation
 */
export interface UrlVariables {
  incidentId?: string;
  serviceName?: string;
  repository?: string;
  sha?: string;
  monitorId?: string;
}
