/**
 * Tests for Validation Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { validateSearchRequest, sanitizeQuery } from '../../../../src/api/middleware/validation';

describe('Validation Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnThis();
    
    mockRequest = {
      body: {},
    };
    
    mockResponse = {
      json: mockJson,
      status: mockStatus,
    };
    
    nextFunction = jest.fn();
  });

  describe('validateSearchRequest', () => {
    it('should pass with valid search request', () => {
      mockRequest.body = {
        query: 'tesla',
        count: 10,
        page: 1,
      };

      validateSearchRequest(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockStatus).not.toHaveBeenCalled();
    });

    it('should use defaults for missing optional fields', () => {
      mockRequest.body = {
        query: 'ford',
      };

      validateSearchRequest(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.body.count).toBe(15);
      expect(mockRequest.body.page).toBe(1);
    });

    it('should reject empty query', () => {
      mockRequest.body = {
        query: '',
      };

      validateSearchRequest(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject invalid characters in query', () => {
      mockRequest.body = {
        query: 'test<script>',
      };

      validateSearchRequest(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject count > 50', () => {
      mockRequest.body = {
        query: 'tesla',
        count: 100,
      };

      validateSearchRequest(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject negative page', () => {
      mockRequest.body = {
        query: 'tesla',
        page: -1,
      };

      validateSearchRequest(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('sanitizeQuery', () => {
    it('should remove HTML characters', () => {
      const result = sanitizeQuery('test<script>alert("xss")</script>');
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
      expect(result).not.toContain('"');
      expect(result).toBe('testscriptalert(xss)/script');
    });

    it('should remove shell metacharacters', () => {
      const result = sanitizeQuery('test;rm -rf /');
      expect(result).not.toContain(';');
      expect(result).toBe('testrm -rf /');
    });

    it('should trim whitespace', () => {
      const result = sanitizeQuery('  tesla  ');
      expect(result).toBe('tesla');
    });

    it('should limit length to 100 chars', () => {
      const longQuery = 'a'.repeat(150);
      const result = sanitizeQuery(longQuery);
      expect(result.length).toBe(100);
    });
  });
});
