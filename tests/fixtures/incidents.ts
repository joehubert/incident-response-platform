import type { Incident, MonitorConfig } from '../../src/lib/types/incident';

export const mockIncident: Incident = {
  id: 'test-incident-1',
  externalId: 'INC-12345',
  monitorId: 'test-monitor',
  serviceName: 'api-service',
  severity: 'critical',
  status: 'active',
  investigationTier: 'tier3',
  metricName: 'error_rate',
  metricValue: 150,
  baselineValue: 10,
  thresholdValue: 50,
  deviationPercentage: 1400,
  errorMessage: 'Database connection failed',
  stackTrace: 'Error: Connection timeout\n  at Database.connect',
  detectedAt: new Date('2026-01-14T10:00:00Z'),
  createdAt: new Date('2026-01-14T10:00:00Z'),
  updatedAt: new Date('2026-01-14T10:00:00Z'),
  tags: ['database', 'api'],
};

export const mockMonitorConfig: MonitorConfig = {
  id: 'test-monitor',
  name: 'Test Monitor',
  description: 'Test monitor config',
  enabled: true,
  queries: {
    metric: 'sum:error.rate{service:api}',
    errorTracking: 'service:api status:error',
  },
  checkIntervalSeconds: 60,
  threshold: {
    type: 'absolute' as const,
    warning: 25,
    critical: 50,
  },
  timeWindow: '5m',
  gitlabRepositories: ['test/repo'],
  enableDatabaseInvestigation: false,
  teamsNotification: {
    channelWebhookUrl: 'https://example.com/webhook',
  },
  tags: ['test'],
  severity: 'critical' as const,
};

export const mockIncidentList: Incident[] = [
  mockIncident,
  {
    ...mockIncident,
    id: 'test-incident-2',
    externalId: 'INC-12346',
    severity: 'high',
    status: 'investigating',
  },
  {
    ...mockIncident,
    id: 'test-incident-3',
    externalId: 'INC-12347',
    severity: 'medium',
    status: 'resolved',
    resolvedAt: new Date('2026-01-14T12:00:00Z'),
  },
];
