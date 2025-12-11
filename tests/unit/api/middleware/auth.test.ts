/**
 * Tests for Authentication Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { authenticateApiKey, authenticateAdmin } from '../../../../src/api/middleware/auth';

describe('Authentication Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    process.env.API_KEY = 'test-api-key-123';
    process.env.ADMIN_TOKEN = 'test-admin-token-456';

    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnThis();
    
    mockRequest = {
      headers: {},
      get: jest.fn((headerName: string) => {
        const headers = mockRequest.headers as Record<string, string>;
        return headers[headerName.toLowerCase()];
      }) as any,
    };
    
    mockResponse = {
      json: mockJson,
      status: mockStatus,
    };
    
    nextFunction = jest.fn();
  });

  afterEach(() => {
    delete process.env.API_KEY;
    delete process.env.ADMIN_TOKEN;
  });

  describe('authenticateApiKey', () => {
    it('should pass with valid API key', () => {
      (mockRequest.headers as any)['x-api-key'] = 'test-api-key-123';

      authenticateApiKey(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockStatus).not.toHaveBeenCalled();
    });

    it('should reject with missing API key', () => {
      mockRequest.headers = {};

      authenticateApiKey(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Authentication required',
        })
      );
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject with invalid API key', () => {
      (mockRequest.headers as any)['x-api-key'] = 'wrong-key';

      authenticateApiKey(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Invalid API key',
        })
      );
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('authenticateAdmin', () => {
    it('should pass with valid admin token', () => {
      (mockRequest.headers as any)['x-admin-token'] = 'test-admin-token-456';

      authenticateAdmin(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockStatus).not.toHaveBeenCalled();
    });

    it('should reject with missing admin token', () => {
      mockRequest.headers = {};

      authenticateAdmin(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockStatus).toHaveBeenCalledWith(403);
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject with invalid admin token', () => {
      (mockRequest.headers as any)['x-admin-token'] = 'wrong-token';

      authenticateAdmin(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockStatus).toHaveBeenCalledWith(403);
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });
});
