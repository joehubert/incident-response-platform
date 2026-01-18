import { Request, Response } from 'express';
import { IncidentsController } from '../../../../src/api/controllers/IncidentsController';
import type { Incident } from '../../../../src/lib/types/incident';

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

describe('IncidentsController', () => {
  let controller: IncidentsController;
  let mockDatabase: {
    listIncidents: jest.Mock;
    getIncident: jest.Mock;
    updateIncident: jest.Mock;
    getActiveIncidentCount: jest.Mock;
  };
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  const mockIncident: Incident = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    externalId: 'INC-123',
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

  beforeEach(() => {
    mockDatabase = {
      listIncidents: jest.fn().mockResolvedValue({
        incidents: [mockIncident],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      }),
      getIncident: jest.fn().mockResolvedValue(mockIncident),
      updateIncident: jest.fn().mockResolvedValue(undefined),
      getActiveIncidentCount: jest.fn().mockResolvedValue(5),
    };

    controller = new IncidentsController(mockDatabase as any);

    mockRequest = {
      query: {},
      params: {},
      body: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  describe('list', () => {
    it('should return paginated incidents', async () => {
      mockRequest.query = { page: '1', limit: '20' };

      await controller.list(mockRequest as Request, mockResponse as Response);

      expect(mockDatabase.listIncidents).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        status: undefined,
        severity: undefined,
        monitorId: undefined,
      });

      expect(mockResponse.json).toHaveBeenCalledWith({
        data: [mockIncident],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      });
    });

    it('should filter by status', async () => {
      mockRequest.query = { status: 'active' };

      await controller.list(mockRequest as Request, mockResponse as Response);

      expect(mockDatabase.listIncidents).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
        })
      );
    });

    it('should handle database errors', async () => {
      mockDatabase.listIncidents.mockRejectedValueOnce(new Error('DB error'));

      await controller.list(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to list incidents',
        },
      });
    });
  });

  describe('get', () => {
    it('should return incident by ID', async () => {
      mockRequest.params = { id: '550e8400-e29b-41d4-a716-446655440000' };

      await controller.get(mockRequest as Request, mockResponse as Response);

      expect(mockDatabase.getIncident).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000'
      );
      expect(mockResponse.json).toHaveBeenCalledWith(mockIncident);
    });

    it('should return 404 for non-existent incident', async () => {
      mockDatabase.getIncident.mockResolvedValueOnce(null);
      mockRequest.params = { id: 'non-existent' };

      await controller.get(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'NOT_FOUND',
          message: 'Incident not found',
        },
      });
    });
  });

  describe('update', () => {
    it('should update incident', async () => {
      mockRequest.params = { id: '550e8400-e29b-41d4-a716-446655440000' };
      mockRequest.body = { status: 'resolved' };

      await controller.update(mockRequest as Request, mockResponse as Response);

      expect(mockDatabase.updateIncident).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        expect.objectContaining({
          status: 'resolved',
          resolvedAt: expect.any(Date),
        })
      );
      expect(mockResponse.json).toHaveBeenCalledWith({ success: true });
    });

    it('should return 404 for non-existent incident', async () => {
      mockDatabase.getIncident.mockResolvedValueOnce(null);
      mockRequest.params = { id: 'non-existent' };
      mockRequest.body = { status: 'resolved' };

      await controller.update(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
    });
  });

  describe('getStats', () => {
    it('should return incident statistics', async () => {
      await controller.getStats(mockRequest as Request, mockResponse as Response);

      expect(mockDatabase.getActiveIncidentCount).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        activeIncidents: 5,
      });
    });
  });
});
