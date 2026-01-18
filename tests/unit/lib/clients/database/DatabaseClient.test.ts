// Mock mssql - must be before imports
const mockQuery = jest.fn();
const mockInput = jest.fn().mockReturnThis();
const mockRequest = jest.fn().mockReturnValue({
  input: mockInput,
  query: mockQuery,
});
const mockPool = {
  request: mockRequest,
  close: jest.fn(),
};

jest.mock('mssql', () => ({
  connect: jest.fn().mockResolvedValue(mockPool),
  UniqueIdentifier: 'UniqueIdentifier',
  NVarChar: jest.fn((size) => ({ type: 'NVarChar', size })),
  VarChar: jest.fn((size) => ({ type: 'VarChar', size })),
  Int: 'Int',
  Float: 'Float',
  DateTime2: 'DateTime2',
  Decimal: jest.fn(() => 'Decimal'),
  MAX: 'MAX',
}));

import { DatabaseClient } from '../../../../../src/lib/clients/database/DatabaseClient';

// Mock config
jest.mock('../../../../../src/config', () => ({
  config: {
    database: {
      host: 'localhost',
      port: 1433,
      database: 'test_db',
      username: 'sa',
      password: 'password',
    },
  },
}));

// Mock logger
jest.mock('../../../../../src/lib/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('DatabaseClient', () => {
  let client: DatabaseClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new DatabaseClient();
  });

  describe('connect', () => {
    it('should connect to database', async () => {
      const mssql = require('mssql');
      await client.connect();

      expect(mssql.connect).toHaveBeenCalled();
    });
  });

  describe('createIncident', () => {
    beforeEach(async () => {
      await client.connect();
      mockQuery.mockResolvedValueOnce({ recordset: [] });
    });

    it('should create incident and return it', async () => {
      const input = {
        monitorId: 'mon-123',
        serviceName: 'api-service',
        severity: 'critical' as const,
        metricName: 'api.errors.5xx',
        metricValue: 100,
        baselineValue: 10,
        thresholdValue: 50,
        errorMessage: 'Test error',
        tags: ['test'],
      };

      const result = await client.createIncident(input);

      expect(result.id).toBeDefined();
      expect(result.externalId).toMatch(/^INC-/);
      expect(result.monitorId).toBe('mon-123');
      expect(result.serviceName).toBe('api-service');
      expect(result.severity).toBe('critical');
      expect(result.status).toBe('active');
      expect(result.deviationPercentage).toBe(900);
    });
  });

  describe('getIncident', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should return incident when found', async () => {
      const mockRow = {
        id: 'inc-123',
        external_id: 'EXT-123',
        monitor_id: 'mon-456',
        service_name: 'api-service',
        severity: 'critical',
        status: 'active',
        investigation_tier: 'tier2',
        metric_name: 'api.errors.5xx',
        metric_value: 100,
        baseline_value: 10,
        threshold_value: 50,
        deviation_percentage: 900,
        error_message: null,
        stack_trace: null,
        detected_at: '2026-01-17T10:00:00Z',
        resolved_at: null,
        created_at: '2026-01-17T10:00:00Z',
        updated_at: '2026-01-17T10:00:00Z',
        tags: '[]',
      };

      mockQuery.mockResolvedValueOnce({ recordset: [mockRow] });

      const result = await client.getIncident('inc-123');

      expect(result).toBeDefined();
      expect(result?.id).toBe('inc-123');
      expect(result?.serviceName).toBe('api-service');
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [] });

      const result = await client.getIncident('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateIncident', () => {
    beforeEach(async () => {
      await client.connect();
      mockQuery.mockResolvedValueOnce({ recordset: [] });
    });

    it('should update incident status', async () => {
      await client.updateIncident('inc-123', { status: 'resolved' });

      expect(mockQuery).toHaveBeenCalled();
      expect(mockInput).toHaveBeenCalledWith('status', expect.anything(), 'resolved');
    });

    it('should update analysis result', async () => {
      await client.updateIncident('inc-123', { analysisResult: '{"test": true}' });

      expect(mockInput).toHaveBeenCalledWith(
        'analysisResult',
        expect.anything(),
        '{"test": true}'
      );
    });
  });

  describe('listIncidents', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should return paginated results', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [{ total: 25 }] });
      mockQuery.mockResolvedValueOnce({
        recordset: [
          {
            id: 'inc-1',
            external_id: 'EXT-1',
            monitor_id: 'mon-1',
            service_name: 'service-1',
            severity: 'high',
            status: 'active',
            investigation_tier: 'tier2',
            metric_name: 'metric',
            metric_value: 100,
            baseline_value: 10,
            threshold_value: 50,
            deviation_percentage: 900,
            detected_at: '2026-01-17T10:00:00Z',
            created_at: '2026-01-17T10:00:00Z',
            updated_at: '2026-01-17T10:00:00Z',
            tags: '[]',
          },
        ],
      });

      const result = await client.listIncidents({ page: 1, limit: 20 });

      expect(result.total).toBe(25);
      expect(result.incidents).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(2);
    });
  });

  describe('getActiveIncidentCount', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should return count of active incidents', async () => {
      mockQuery.mockResolvedValueOnce({ recordset: [{ count: 5 }] });

      const result = await client.getActiveIncidentCount();

      expect(result).toBe(5);
    });
  });

  describe('storeLLMUsage', () => {
    beforeEach(async () => {
      await client.connect();
      mockQuery.mockResolvedValueOnce({ recordset: [] });
    });

    it('should store LLM usage record', async () => {
      const input = {
        incidentId: 'inc-123',
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
        modelName: 'gemini-1.5-pro',
        requestDurationMs: 2000,
        estimatedCostUsd: 0.05,
      };

      const result = await client.storeLLMUsage(input);

      expect(result.id).toBeDefined();
      expect(result.incidentId).toBe('inc-123');
      expect(result.totalTokens).toBe(1500);
    });
  });
});
