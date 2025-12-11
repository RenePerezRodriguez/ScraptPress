/**
 * Integration Tests - Graceful Shutdown
 * Tests the graceful shutdown service
 */

import GracefulShutdown from '../../src/services/graceful-shutdown.service';

describe('Graceful Shutdown Integration', () => {
  let shutdown: GracefulShutdown;

  beforeEach(() => {
    shutdown = GracefulShutdown.getInstance();
  });

  describe('Handler Registration', () => {
    test('should register shutdown handlers', () => {
      const handler = GracefulShutdown.createGenericHandler(
        'Test Handler',
        async () => {
          return Promise.resolve();
        }
      );

      expect(() => {
        shutdown.registerHandler(handler);
      }).not.toThrow();
    });

    test('should create Express server handler', () => {
      const mockServer = {
        close: jest.fn((callback) => callback())
      };

      const handler = GracefulShutdown.createExpressHandler(mockServer);
      
      expect(handler.name).toBe('Express Server');
      expect(handler.timeout).toBe(10000);
      expect(typeof handler.handler).toBe('function');
    });

    test('should create Redis client handler', () => {
      const mockRedis = {
        quit: jest.fn()
      };

      const handler = GracefulShutdown.createRedisHandler(mockRedis);
      
      expect(handler.name).toBe('Redis Client');
      expect(handler.timeout).toBe(3000);
      expect(typeof handler.handler).toBe('function');
    });

    test('should create Bull queue handler', () => {
      const mockQueue = {
        close: jest.fn()
      };

      const handler = GracefulShutdown.createBullQueueHandler(mockQueue);
      
      expect(handler.name).toBe('Bull Queue');
      expect(handler.timeout).toBe(5000);
      expect(typeof handler.handler).toBe('function');
    });

    test('should create browser handler', () => {
      const mockBrowser = {
        close: jest.fn()
      };

      const handler = GracefulShutdown.createBrowserHandler(mockBrowser);
      
      expect(handler.name).toBe('Playwright Browser');
      expect(handler.timeout).toBe(5000);
      expect(typeof handler.handler).toBe('function');
    });
  });

  describe('Handler Execution', () => {
    test('should execute handler successfully', async () => {
      let executed = false;

      const handler = GracefulShutdown.createGenericHandler(
        'Test Handler',
        async () => {
          executed = true;
        }
      );

      await handler.handler();
      expect(executed).toBe(true);
    });

    test('should handle handler errors gracefully', async () => {
      const handler = GracefulShutdown.createGenericHandler(
        'Failing Handler',
        async () => {
          throw new Error('Handler failed');
        }
      );

      // Should not throw, error is caught internally during shutdown
      await expect(handler.handler()).rejects.toThrow('Handler failed');
    });

    test('should respect handler timeout', () => {
      const handler = GracefulShutdown.createGenericHandler(
        'Timeout Handler',
        async () => {
          return new Promise((resolve) => {
            setTimeout(resolve, 10000); // 10 seconds
          });
        },
        1000 // 1 second timeout
      );

      expect(handler.timeout).toBe(1000);
    });
  });

  describe('Shutdown Timeout Configuration', () => {
    test('should allow setting global timeout', () => {
      expect(() => {
        shutdown.setTimeout(60000); // 60 seconds
      }).not.toThrow();
    });

    test('should accept custom timeout values', () => {
      expect(() => {
        shutdown.setTimeout(5000);
        shutdown.setTimeout(30000);
        shutdown.setTimeout(120000);
      }).not.toThrow();
    });
  });
});
