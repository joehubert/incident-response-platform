import { NotificationService } from '../../../../src/services/notification/NotificationService';
import type { Incident, MonitorConfig } from '../../../../src/lib/types/incident';
import type { IncidentAnalysis } from '../../../../src/lib/types/analysis';

// Mock TeamsClient
const mockSendMessage = jest.fn().mockResolvedValue({ success: true, messageId: 'msg-123' });
const mockIsConfigured = jest.fn().mockReturnValue(true);
const mockGetStatus = jest.fn().mockReturnValue({ webhookConfigured: true, graphConfigured: false });

jest.mock('../../../../src/lib/clients/teams', () => ({
  TeamsClient: jest.fn().mockImplementation(() => ({
    sendMessage: mockSendMessage,
    isConfigured: mockIsConfigured,
    getStatus: mockGetStatus,
  })),
}));

// Mock DatabaseClient
const mockUpdateIncident = jest.fn().mockResolvedValue(undefined);
const mockGetActiveIncidentCount = jest.fn().mockResolvedValue(5);

// Mock logger
jest.mock('../../../../src/lib/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock metrics
jest.mock('../../../../src/lib/utils/metrics', () => ({
  activeIncidents: {
    set: jest.fn(),
  },
}));

describe('NotificationService', () => {
  let service: NotificationService;
  let mockDatabase: {
    updateIncident: jest.Mock;
    getActiveIncidentCount: jest.Mock;
  };

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
    detectedAt: new Date('2026-01-17T10:00:00Z'),
    createdAt: new Date('2026-01-17T10:00:00Z'),
    updatedAt: new Date('2026-01-17T10:00:00Z'),
    tags: [],
  };

  const mockAnalysis: IncidentAnalysis = {
    incidentId: 'inc-123',
    summary: 'Test summary',
    rootCause: {
      hypothesis: 'Test hypothesis',
      confidence: 'high',
      evidence: ['Evidence 1'],
    },
    mechanism: 'Test mechanism',
    contributingFactors: [],
    recommendedActions: [],
    estimatedComplexity: 'low',
    requiresHumanReview: false,
    metadata: {
      analyzedAt: new Date(),
      modelUsed: 'gemini-1.5-pro',
      tokensUsed: { input: 100, output: 50, total: 150 },
      durationMs: 1000,
    },
  };

  const mockMonitor: MonitorConfig = {
    id: 'mon-456',
    name: 'Test Monitor',
    description: 'Test',
    enabled: true,
    queries: { metric: 'test.metric' },
    checkIntervalSeconds: 60,
    threshold: { type: 'absolute', warning: 30, critical: 50 },
    timeWindow: '5m',
    gitlabRepositories: [],
    enableDatabaseInvestigation: false,
    teamsNotification: {
      channelWebhookUrl: 'https://webhook.test/channel',
    },
    tags: [],
    severity: 'critical',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDatabase = {
      updateIncident: mockUpdateIncident,
      getActiveIncidentCount: mockGetActiveIncidentCount,
    };

    service = new NotificationService(mockDatabase as any);
  });

  describe('notify', () => {
    it('should send notification via Teams', async () => {
      const result = await service.notify(mockIncident, mockAnalysis, mockMonitor);

      expect(result.success).toBe(true);
      expect(result.channelUsed).toBe('webhook');
      expect(mockSendMessage).toHaveBeenCalled();
    });

    it('should update incident with analysis', async () => {
      await service.notify(mockIncident, mockAnalysis, mockMonitor);

      expect(mockUpdateIncident).toHaveBeenCalledWith(
        'inc-123',
        expect.objectContaining({
          analysisResult: expect.any(String),
        })
      );
    });

    it('should update active incidents metric', async () => {
      await service.notify(mockIncident, mockAnalysis, mockMonitor);

      expect(mockGetActiveIncidentCount).toHaveBeenCalled();
    });

    it('should return failure when Teams is not configured', async () => {
      mockIsConfigured.mockReturnValueOnce(false);

      const monitorNoWebhook = {
        ...mockMonitor,
        teamsNotification: { channelWebhookUrl: '' },
      };

      const result = await service.notify(mockIncident, mockAnalysis, monitorNoWebhook);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No Teams channel configured');
    });

    it('should handle Teams send failure gracefully', async () => {
      mockSendMessage.mockRejectedValueOnce(new Error('Send failed'));

      const result = await service.notify(mockIncident, mockAnalysis, mockMonitor);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Send failed');
    });
  });

  describe('notifyCompact', () => {
    it('should send compact notification', async () => {
      const result = await service.notifyCompact(
        mockIncident,
        mockAnalysis,
        'https://webhook.test/channel'
      );

      expect(result.success).toBe(true);
      expect(mockSendMessage).toHaveBeenCalled();
    });
  });

  describe('notifyResolution', () => {
    it('should send resolution notification', async () => {
      const resolvedIncident = {
        ...mockIncident,
        status: 'resolved' as const,
        resolvedAt: new Date(),
      };

      const result = await service.notifyResolution(
        resolvedIncident,
        'https://webhook.test/channel'
      );

      expect(result.success).toBe(true);
    });
  });

  describe('isConfigured', () => {
    it('should return Teams configuration status', () => {
      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should return service status', () => {
      const status = service.getStatus();

      expect(status.teamsConfigured).toBe(true);
      expect(status.teamsStatus).toBeDefined();
    });
  });
});
