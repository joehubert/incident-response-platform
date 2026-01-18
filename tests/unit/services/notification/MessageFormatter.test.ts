import { MessageFormatter } from '../../../../src/services/notification/MessageFormatter';
import type { Incident, MonitorConfig } from '../../../../src/lib/types/incident';
import type { IncidentAnalysis } from '../../../../src/lib/types/analysis';

describe('MessageFormatter', () => {
  let formatter: MessageFormatter;

  const mockIncident: Incident = {
    id: 'inc-123',
    externalId: 'EXT-123',
    monitorId: 'mon-456',
    serviceName: 'api-service',
    severity: 'critical',
    status: 'active',
    investigationTier: 'tier2',
    metricName: 'api.errors.5xx',
    metricValue: 150,
    baselineValue: 10,
    thresholdValue: 50,
    deviationPercentage: 1400,
    errorMessage: 'NullPointerException',
    stackTrace: 'at com.example.Service.method(Service.java:42)',
    detectedAt: new Date('2026-01-17T10:00:00Z'),
    createdAt: new Date('2026-01-17T10:00:00Z'),
    updatedAt: new Date('2026-01-17T10:00:00Z'),
    tags: ['service:api', 'env:production'],
  };

  const mockAnalysis: IncidentAnalysis = {
    incidentId: 'inc-123',
    summary: 'A null pointer exception is occurring in the service layer due to missing input validation.',
    rootCause: {
      hypothesis: 'Missing null check in the request handler',
      confidence: 'high',
      evidence: [
        'Stack trace points to Service.java:42',
        'Recent commit abc123 modified this file',
        'No null check before accessing request data',
      ],
      suspectedCommit: {
        sha: 'abc123def456',
        repository: 'myorg/api-service',
        reason: 'Modified the affected file 30 minutes before incident',
      },
    },
    mechanism: 'NullPointerException thrown when request.getData() returns null',
    contributingFactors: ['Missing input validation', 'No defensive coding'],
    recommendedActions: [
      {
        priority: 1,
        action: 'Add null check before accessing request data',
        reasoning: 'Prevents the exception from occurring',
        estimatedImpact: 'High - Resolves root cause',
      },
      {
        priority: 2,
        action: 'Consider rollback to previous version',
        reasoning: 'Quick mitigation while fix is developed',
        estimatedImpact: 'Medium - Temporary fix',
      },
    ],
    estimatedComplexity: 'low',
    requiresHumanReview: false,
    requiresRollback: true,
    metadata: {
      analyzedAt: new Date('2026-01-17T10:05:00Z'),
      modelUsed: 'gemini-1.5-pro',
      tokensUsed: { input: 1000, output: 500, total: 1500 },
      durationMs: 3000,
    },
  };

  const mockMonitor: MonitorConfig = {
    id: 'mon-456',
    name: 'API Error Rate Monitor',
    description: 'Monitors 5xx errors on API service',
    enabled: true,
    queries: {
      metric: 'sum:api.errors.5xx{service:api}',
      errorTracking: 'service:api-service',
    },
    checkIntervalSeconds: 60,
    threshold: { type: 'absolute', warning: 30, critical: 50 },
    timeWindow: '5m',
    gitlabRepositories: ['myorg/api-service'],
    enableDatabaseInvestigation: false,
    teamsNotification: {
      channelWebhookUrl: 'https://webhook.test/channel',
      urlPatterns: {
        datadog: 'https://app.datadoghq.com/dashboard?service={{serviceName}}',
        gitlab: 'https://gitlab.com/{{repository}}/-/commit/{{sha}}',
        incident: 'https://incidents.example.com/{{incidentId}}',
      },
    },
    tags: ['api', 'production'],
    severity: 'critical',
  };

  beforeEach(() => {
    formatter = new MessageFormatter();
  });

  describe('formatIncidentMessage', () => {
    it('should include severity indicator', () => {
      const message = formatter.formatIncidentMessage(mockIncident, mockAnalysis, mockMonitor);

      expect(message).toContain('[CRITICAL]');
      expect(message).toContain('INCIDENT DETECTED');
      expect(message).toContain('API Error Rate Monitor');
    });

    it('should include metric details', () => {
      const message = formatter.formatIncidentMessage(mockIncident, mockAnalysis, mockMonitor);

      expect(message).toContain('api.errors.5xx');
      expect(message).toContain('150');
      expect(message).toContain('10');
    });

    it('should include root cause summary', () => {
      const message = formatter.formatIncidentMessage(mockIncident, mockAnalysis, mockMonitor);

      expect(message).toContain('ROOT CAUSE');
      expect(message).toContain('null pointer exception');
      expect(message).toContain('Missing null check');
    });

    it('should include evidence', () => {
      const message = formatter.formatIncidentMessage(mockIncident, mockAnalysis, mockMonitor);

      expect(message).toContain('EVIDENCE');
      expect(message).toContain('Stack trace points to Service.java:42');
    });

    it('should include suspected commit', () => {
      const message = formatter.formatIncidentMessage(mockIncident, mockAnalysis, mockMonitor);

      expect(message).toContain('SUSPECTED COMMIT');
      expect(message).toContain('abc123de');
      expect(message).toContain('myorg/api-service');
    });

    it('should include recommended actions', () => {
      const message = formatter.formatIncidentMessage(mockIncident, mockAnalysis, mockMonitor);

      expect(message).toContain('RECOMMENDED ACTIONS');
      expect(message).toContain('Add null check');
    });

    it('should include rollback warning when required', () => {
      const message = formatter.formatIncidentMessage(mockIncident, mockAnalysis, mockMonitor);

      expect(message).toContain('ROLLBACK MAY BE REQUIRED');
    });

    it('should include interpolated links', () => {
      const message = formatter.formatIncidentMessage(mockIncident, mockAnalysis, mockMonitor);

      expect(message).toContain('LINKS');
      expect(message).toContain('incidents.example.com');
      expect(message).toContain('app.datadoghq.com');
      expect(message).toContain('gitlab.com');
    });
  });

  describe('formatCompactMessage', () => {
    it('should create a brief summary', () => {
      const message = formatter.formatCompactMessage(mockIncident, mockAnalysis);

      expect(message).toContain('[CRITICAL]');
      expect(message).toContain('api-service');
      expect(message).toContain('null pointer exception');
    });

    it('should include suspected commit SHA', () => {
      const message = formatter.formatCompactMessage(mockIncident, mockAnalysis);

      expect(message).toContain('abc123de');
    });
  });

  describe('formatResolutionMessage', () => {
    it('should format resolution notification', () => {
      const resolvedIncident = {
        ...mockIncident,
        status: 'resolved' as const,
        resolvedAt: new Date('2026-01-17T11:00:00Z'),
      };

      const message = formatter.formatResolutionMessage(resolvedIncident);

      expect(message).toContain('RESOLVED');
      expect(message).toContain('api-service');
      expect(message).toContain('inc-123');
    });
  });

  describe('severity emoji', () => {
    it('should use HIGH for high severity', () => {
      const highIncident = { ...mockIncident, severity: 'high' as const };
      const message = formatter.formatIncidentMessage(highIncident, mockAnalysis, mockMonitor);

      expect(message).toContain('[HIGH]');
    });

    it('should use MEDIUM for medium severity', () => {
      const mediumIncident = { ...mockIncident, severity: 'medium' as const };
      const message = formatter.formatIncidentMessage(mediumIncident, mockAnalysis, mockMonitor);

      expect(message).toContain('[MEDIUM]');
    });

    it('should use LOW for low severity', () => {
      const lowIncident = { ...mockIncident, severity: 'low' as const };
      const message = formatter.formatIncidentMessage(lowIncident, mockAnalysis, mockMonitor);

      expect(message).toContain('[LOW]');
    });
  });
});
