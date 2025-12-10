/**
 * Validation Middleware Tests
 * Tests for XSS/SQL injection detection
 */

import { 
  containsXSS, 
  containsSQLInjection, 
  containsPathTraversal,
  sanitizeQuery 
} from '../../src/api/middleware/validation';

describe('Security Validation', () => {
  describe('XSS Detection', () => {
    test('should detect script tags', () => {
      expect(containsXSS('<script>alert("xss")</script>')).toBe(true);
      expect(containsXSS('<SCRIPT>alert("xss")</SCRIPT>')).toBe(true);
    });

    test('should detect iframe tags', () => {
      expect(containsXSS('<iframe src="evil.com"></iframe>')).toBe(true);
    });

    test('should detect javascript: protocol', () => {
      expect(containsXSS('javascript:alert(1)')).toBe(true);
    });

    test('should detect event handlers', () => {
      expect(containsXSS('onerror=alert(1)')).toBe(true);
      expect(containsXSS('onload=alert(1)')).toBe(true);
      expect(containsXSS('onclick=alert(1)')).toBe(true);
    });

    test('should not detect valid queries', () => {
      expect(containsXSS('toyota camry')).toBe(false);
      expect(containsXSS('honda civic 2020')).toBe(false);
      expect(containsXSS('ford f-150')).toBe(false);
    });
  });

  describe('SQL Injection Detection', () => {
    test('should detect SQL keywords', () => {
      expect(containsSQLInjection('SELECT * FROM users')).toBe(true);
      expect(containsSQLInjection('DROP TABLE vehicles')).toBe(true);
      expect(containsSQLInjection('INSERT INTO users')).toBe(true);
    });

    test('should detect UNION attacks', () => {
      expect(containsSQLInjection('UNION SELECT password')).toBe(true);
    });

    test('should detect OR 1=1 attacks', () => {
      expect(containsSQLInjection("' OR 1=1 --")).toBe(true);
      expect(containsSQLInjection("' OR '1'='1")).toBe(true);
    });

    test('should not detect valid queries', () => {
      expect(containsSQLInjection('toyota camry')).toBe(false);
      expect(containsSQLInjection('honda civic')).toBe(false);
    });
  });

  describe('Path Traversal Detection', () => {
    test('should detect directory traversal', () => {
      expect(containsPathTraversal('../etc/passwd')).toBe(true);
      expect(containsPathTraversal('..\\windows\\system32')).toBe(true);
      expect(containsPathTraversal('..%2F..%2Fetc%2Fpasswd')).toBe(true);
    });

    test('should not detect valid queries', () => {
      expect(containsPathTraversal('toyota camry')).toBe(false);
      expect(containsPathTraversal('honda civic')).toBe(false);
    });
  });

  describe('Query Sanitization', () => {
    test('should remove dangerous characters', () => {
      expect(sanitizeQuery('<script>alert()</script>')).toBe('scriptalert()script');
      expect(sanitizeQuery('toyota;DROP TABLE')).toBe('toyotaDROP TABLE');
    });

    test('should trim and limit length', () => {
      const longQuery = 'a'.repeat(150);
      expect(sanitizeQuery(longQuery)).toHaveLength(100);
      expect(sanitizeQuery('  toyota  ')).toBe('toyota');
    });

    test('should throw on XSS attempts', () => {
      expect(() => sanitizeQuery('<script>alert(1)</script>')).toThrow('XSS');
    });

    test('should throw on SQL injection attempts', () => {
      expect(() => sanitizeQuery("' OR 1=1 --")).toThrow('SQL');
    });
  });
});
