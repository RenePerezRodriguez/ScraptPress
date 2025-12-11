/**
 * Integration Tests - API Endpoints
 * Tests the actual API endpoints with mocked dependencies
 */

import request from 'supertest';
import express from 'express';
import apiRoutes from '../../src/api/routes';
import { requestIdMiddleware } from '../../src/api/middleware/requestId';

// Mock external dependencies to avoid connection errors in testing
jest.mock('../../src/services/cache.service', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(true),
    getStats: jest.fn().mockResolvedValue({
      connected: true,
      info: 'mocked',
      error: null
    })
  }
}));

jest.mock('../../src/services/rate-limiter.service', () => ({
  __esModule: true,
  default: {
    checkLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 100 }),
    getRedisClient: jest.fn().mockReturnValue({
      ping: jest.fn().mockResolvedValue('PONG')
    })
  }
}));

jest.mock('../../src/config/firebase', () => ({
  getFirestore: jest.fn().mockReturnValue({
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ exists: true })
      })
    })
  })
}));

describe('API Integration Tests', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use('/api', apiRoutes);
  });

  describe('Health Check Endpoint', () => {
    test('GET /api/health should return 200', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('status');
    });

    test('should include Request-ID header', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-request-id');
      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('Search Endpoint - Validation', () => {
    test('GET /api/search/vehicles without query should return 400', async () => {
      const response = await request(app)
        .get('/api/search/vehicles')
        .set('X-API-Key', 'test-key')
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    test('GET /api/search/vehicles with XSS attempt should return 400', async () => {
      const response = await request(app)
        .get('/api/search/vehicles')
        .query({ query: '<script>alert("xss")</script>' })
        .set('X-API-Key', 'test-key')
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.code).toBe('SECURITY_XSS_DETECTED');
    });

    test('GET /api/search/vehicles with SQL injection should return 400', async () => {
      const response = await request(app)
        .get('/api/search/vehicles')
        .query({ query: "' OR 1=1 --" })
        .set('X-API-Key', 'test-key')
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.code).toBe('SECURITY_SQL_INJECTION_DETECTED');
    });

    test('GET /api/search/vehicles with path traversal should return 400', async () => {
      const response = await request(app)
        .get('/api/search/vehicles')
        .query({ query: '../../../etc/passwd' })
        .set('X-API-Key', 'test-key')
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.code).toBe('SECURITY_PATH_TRAVERSAL_DETECTED');
    });

    test('GET /api/search/vehicles with valid query should accept', async () => {
      const response = await request(app)
        .get('/api/search/vehicles')
        .query({ query: 'toyota camry', page: 1, limit: 10 })
        .set('X-API-Key', 'test-key');

      // May return 200 or 503 depending on services availability
      expect([200, 503]).toContain(response.status);
      expect(response.body).toHaveProperty('requestId');
    });
  });

  describe('Metrics Endpoint', () => {
    test('GET /api/metrics should return system metrics', async () => {
      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('current');
      expect(response.body.current).toHaveProperty('uptime');
      expect(response.body.current).toHaveProperty('memoryUsage');
    });
  });
});
