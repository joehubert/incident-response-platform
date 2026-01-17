import { AnalysisService } from '../../../../src/services/analysis/AnalysisService';
import { RedisClient } from '../../../../src/lib/clients/redis';
import { DatabaseClient } from '../../../../src/lib/clients/database';
import type { Incident } from '../../../../src/lib/types/incident';
import type { EvidenceBundle } from '../../../../src/lib/types/evidence';

// Mock the GeminiClient
jest.mock('../../../../src/lib/clients/gemini/GeminiClient', () => {
  return {
    GeminiClient: jest.fn().mockImplementation(() => ({
      generateAnalysis: jest.fn(),
      calculateCost: jest.fn().mockReturnValue(0.005),
      getCircuitBreakerState: jest.fn().mockReturnValue('closed'),
    })),
  };
});

// Mock logger
jest.mock('../../../../src/lib/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock metrics
jest.mock('../../../../src/lib/utils/metrics', () => ({
  analysisDuration: {
    startTimer: jest.fn().mockReturnValue(jest.fn()),
  },
}));

describe('AnalysisService', () => {
  let analysisService: AnalysisService;
  let mockRedis: jest.Mocked<RedisClient>;
  let mockDatabase: jest.Mocked<DatabaseClient>;

  const mockIncident: Incident = {
    id: 'inc-123',
    externalId: 'ext-123',
    monitorId: 'mon-123',
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
    tags: ['service:api'],
  };

  const mockEvidence: EvidenceBundle = {
    incidentId: 'inc-123',
    investigationTier: 'tier2',
    completeness: 0.8,
    collectedAt: new Date('2026-01-17T10:01:00Z'),
    datadogContext: {
      errorDetails: {
        errorMessage: 'NullPointerException',
        stackTrace: 'at com.example.Service.method(Service.java:42)',
      },
      metricHistory: [
        { timestamp: new Date(), value: 150 },
      ],
    },
    gitlabContext: {
      commits: [
        {
          sha: 'abc123',
          message: 'Fix null handling',
          author: { name: 'John Doe', email: 'john@example.com' },
          timestamp: new Date('2026-01-17T09:30:00Z'),
          repository: 'myorg/api-service',
          filesChanged: ['Service.java'],
          additions: 10,
          deletions: 2,
          score: { temporal: 0.9, risk: 0.7, combined: 0.85 },
        },
      ],
      scoringMethod: 'stack-trace',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as jest.Mocked<RedisClient>;

    mockDatabase = {
      storeLLMUsage: jest.fn().mockResolvedValue({}),
      connect: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as jest.Mocked<DatabaseClient>;

    analysisService = new AnalysisService(mockRedis, mockDatabase);
  });

  describe('analyze', () => {
    it('should return valid analysis from LLM response', async () => {
      const mockLLMResponse = {
        content: {
          summary: 'NullPointerException in api-service caused by recent commit',
          rootCause: {
            hypothesis: 'The recent commit abc123 introduced a null check regression',
            confidence: 'high',
            evidence: ['Stack trace points to Service.java:42', 'Commit modified this file'],
            suspectedCommit: {
              sha: 'abc123',
              repository: 'myorg/api-service',
              reason: 'Modified the affected file 30 minutes before incident',
            },
          },
          mechanism: 'A null reference is being passed to a method that expects a non-null value',
          contributingFactors: ['Missing null check', 'No input validation'],
          recommendedActions: [
            {
              priority: 1,
              action: 'Revert commit abc123',
              reasoning: 'Quick fix to restore service',
              estimatedImpact: 'Immediate resolution',
            },
          ],
          estimatedComplexity: 'low',
          requiresHumanReview: false,
          requiresRollback: true,
        },
        tokenUsage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
        durationMs: 2500,
        modelUsed: 'gemini-1.5-pro',
      };

      // Access private gemini client and mock its method
      const geminiClient = (analysisService as any).gemini;
      geminiClient.generateAnalysis = jest.fn().mockResolvedValue(mockLLMResponse);

      const result = await analysisService.analyze(mockIncident, mockEvidence);

      expect(result).toBeDefined();
      expect(result.incidentId).toBe('inc-123');
      expect(result.summary).toContain('NullPointerException');
      expect(result.rootCause.confidence).toBe('high');
      expect(result.rootCause.suspectedCommit?.sha).toBe('abc123');
      expect(result.estimatedComplexity).toBe('low');
      expect(result.requiresRollback).toBe(true);
      expect(result.metadata.modelUsed).toBe('gemini-1.5-pro');
    });

    it('should store LLM usage after successful analysis', async () => {
      const mockLLMResponse = {
        content: {
          summary: 'Test summary for the incident',
          rootCause: {
            hypothesis: 'Test hypothesis explaining the root cause',
            confidence: 'medium',
            evidence: ['Evidence 1'],
          },
          mechanism: 'Test mechanism description for the failure',
          contributingFactors: [],
          recommendedActions: [
            {
              priority: 1,
              action: 'Test action',
              reasoning: 'Test reasoning',
              estimatedImpact: 'Test impact',
            },
          ],
          estimatedComplexity: 'medium',
          requiresHumanReview: true,
        },
        tokenUsage: { inputTokens: 800, outputTokens: 400, totalTokens: 1200 },
        durationMs: 2000,
        modelUsed: 'gemini-1.5-pro',
      };

      const geminiClient = (analysisService as any).gemini;
      geminiClient.generateAnalysis = jest.fn().mockResolvedValue(mockLLMResponse);

      await analysisService.analyze(mockIncident, mockEvidence);

      expect(mockDatabase.storeLLMUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          incidentId: 'inc-123',
          inputTokens: 800,
          outputTokens: 400,
          totalTokens: 1200,
          modelName: 'gemini-1.5-pro',
        })
      );
    });

    it('should return fallback analysis when LLM fails', async () => {
      const geminiClient = (analysisService as any).gemini;
      geminiClient.generateAnalysis = jest.fn().mockRejectedValue(new Error('LLM unavailable'));

      const result = await analysisService.analyze(mockIncident, mockEvidence);

      expect(result).toBeDefined();
      expect(result.incidentId).toBe('inc-123');
      expect(result.rootCause.confidence).toBe('low');
      expect(result.requiresHumanReview).toBe(true);
      expect(result.metadata.modelUsed).toBe('fallback-template');
      expect(result.metadata.tokensUsed.total).toBe(0);
    });

    it('should return fallback analysis when LLM response fails validation', async () => {
      const invalidLLMResponse = {
        content: {
          summary: 'Short', // Too short, will fail validation
          rootCause: {
            hypothesis: 'Short', // Too short
            confidence: 'invalid', // Invalid enum value
            evidence: [], // Empty array not allowed
          },
        },
        tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        durationMs: 500,
        modelUsed: 'gemini-1.5-pro',
      };

      const geminiClient = (analysisService as any).gemini;
      geminiClient.generateAnalysis = jest.fn().mockResolvedValue(invalidLLMResponse);

      const result = await analysisService.analyze(mockIncident, mockEvidence);

      expect(result.requiresHumanReview).toBe(true);
      expect(result.metadata.modelUsed).toBe('fallback-template');
    });

    it('should include suspected commit from evidence in fallback analysis', async () => {
      const geminiClient = (analysisService as any).gemini;
      geminiClient.generateAnalysis = jest.fn().mockRejectedValue(new Error('LLM unavailable'));

      const result = await analysisService.analyze(mockIncident, mockEvidence);

      expect(result.rootCause.suspectedCommit).toBeDefined();
      expect(result.rootCause.suspectedCommit?.sha).toBe('abc123');
      expect(result.rootCause.suspectedCommit?.repository).toBe('myorg/api-service');
    });

    it('should handle evidence without commits gracefully', async () => {
      const geminiClient = (analysisService as any).gemini;
      geminiClient.generateAnalysis = jest.fn().mockRejectedValue(new Error('LLM unavailable'));

      const evidenceWithoutCommits: EvidenceBundle = {
        incidentId: 'inc-123',
        investigationTier: 'tier3',
        completeness: 0.3,
        collectedAt: new Date(),
        datadogContext: {
          metricHistory: [],
        },
      };

      const result = await analysisService.analyze(mockIncident, evidenceWithoutCommits);

      expect(result.rootCause.suspectedCommit).toBeUndefined();
      expect(result.rootCause.hypothesis).toContain('Unable to determine root cause');
    });
  });

  describe('getCircuitBreakerState', () => {
    it('should return the circuit breaker state', () => {
      const state = analysisService.getCircuitBreakerState();
      expect(state).toBe('closed');
    });
  });
});
