import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateRequest, paginationSchema, uuidSchema } from '../../../../src/api/middleware/validation';

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

describe('Validation Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      body: {},
      query: {},
      params: {},
      path: '/api/v1/test',
      method: 'GET',
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    nextFunction = jest.fn();
  });

  describe('validateRequest', () => {
    it('should pass valid body', () => {
      const schema = {
        body: z.object({
          name: z.string(),
        }),
      };

      mockRequest.body = { name: 'Test' };

      const middleware = validateRequest(schema);
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });

    it('should reject invalid body', () => {
      const schema = {
        body: z.object({
          name: z.string(),
        }),
      };

      mockRequest.body = { name: 123 };

      const middleware = validateRequest(schema);
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: expect.any(Array),
        },
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should validate query params', () => {
      const schema = {
        query: z.object({
          page: z.string().regex(/^\d+$/),
        }),
      };

      mockRequest.query = { page: '1' };

      const middleware = validateRequest(schema);
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });

    it('should validate URL params', () => {
      const schema = {
        params: z.object({
          id: z.string().uuid(),
        }),
      };

      mockRequest.params = { id: '550e8400-e29b-41d4-a716-446655440000' };

      const middleware = validateRequest(schema);
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });

    it('should reject invalid URL params', () => {
      const schema = {
        params: z.object({
          id: z.string().uuid(),
        }),
      };

      mockRequest.params = { id: 'not-a-uuid' };

      const middleware = validateRequest(schema);
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('paginationSchema', () => {
    it('should parse valid pagination params', () => {
      const result = paginationSchema.parse({ page: '2', limit: '50' });

      expect(result.page).toBe(2);
      expect(result.limit).toBe(50);
    });

    it('should use defaults for missing params', () => {
      const result = paginationSchema.parse({});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should cap limit at 100', () => {
      const result = paginationSchema.parse({ limit: '200' });

      expect(result.limit).toBe(100);
    });
  });

  describe('uuidSchema', () => {
    it('should accept valid UUID', () => {
      const result = uuidSchema.parse({ id: '550e8400-e29b-41d4-a716-446655440000' });

      expect(result.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should reject invalid UUID', () => {
      expect(() => uuidSchema.parse({ id: 'not-a-uuid' })).toThrow();
    });
  });
});
