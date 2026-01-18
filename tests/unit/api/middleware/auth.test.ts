import { Request, Response, NextFunction } from 'express';
import { authenticateApiKey, generateApiKey, hashApiKey } from '../../../../src/api/middleware/auth';

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

describe('Auth Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
      path: '/api/v1/incidents',
      method: 'GET',
      ip: '127.0.0.1',
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    nextFunction = jest.fn();
  });

  describe('authenticateApiKey', () => {
    it('should reject request without API key', async () => {
      await authenticateApiKey(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Missing API key',
        },
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject request with invalid API key format', async () => {
      mockRequest.headers = { 'x-api-key': 'invalid-key' };

      await authenticateApiKey(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Invalid API key format',
        },
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should accept valid API key', async () => {
      mockRequest.headers = { 'x-api-key': 'irp_test_key_12345' };

      await authenticateApiKey(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalled();
      expect((mockRequest as any).apiKey).toBeDefined();
    });
  });

  describe('generateApiKey', () => {
    it('should generate key with irp_ prefix', () => {
      const key = generateApiKey();

      expect(key).toMatch(/^irp_[a-f0-9]{64}$/);
    });

    it('should generate unique keys', () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();

      expect(key1).not.toEqual(key2);
    });
  });

  describe('hashApiKey', () => {
    it('should return SHA256 hash', () => {
      const hash = hashApiKey('irp_test_key');

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it('should return consistent hash for same input', () => {
      const hash1 = hashApiKey('irp_test_key');
      const hash2 = hashApiKey('irp_test_key');

      expect(hash1).toEqual(hash2);
    });

    it('should return different hash for different input', () => {
      const hash1 = hashApiKey('irp_key_1');
      const hash2 = hashApiKey('irp_key_2');

      expect(hash1).not.toEqual(hash2);
    });
  });
});
