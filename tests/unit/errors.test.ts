/**
 * ErrorCode Enum Tests
 * Tests for standardized error codes
 */

import { ErrorCode, createErrorResponse } from '../../src/types/errors';

describe('Error Code System', () => {
  describe('createErrorResponse', () => {
    test('should create standard error response', () => {
      const error = createErrorResponse(
        ErrorCode.AUTH_FAILED,
        'API key is required'
      );

      expect(error.success).toBe(false);
      expect(error.code).toBe(ErrorCode.AUTH_FAILED);
      expect(error.error).toBe('API key is required');
      expect(error.timestamp).toBeDefined();
    });

    test('should include message when provided', () => {
      const error = createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        'Validation failed',
        'Field query is invalid'
      );

      expect(error.message).toBe('Field query is invalid');
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    test('should include timestamp in ISO format', () => {
      const error = createErrorResponse(
        ErrorCode.INTERNAL_ERROR,
        'Server error'
      );

      expect(error.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    test('should work with different error codes', () => {
      const codes = [
        ErrorCode.AUTH_FAILED,
        ErrorCode.VALIDATION_ERROR,
        ErrorCode.RATE_LIMIT_EXCEEDED,
        ErrorCode.SCRAPE_FAILED,
        ErrorCode.REDIS_UNAVAILABLE
      ];

      codes.forEach(code => {
        const error = createErrorResponse(code, 'Test error');
        expect(error.code).toBe(code);
        expect(error.success).toBe(false);
      });
    });
  });
});
