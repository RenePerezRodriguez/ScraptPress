/**
 * Graceful Shutdown Handler
 * Ensures clean shutdown on SIGTERM/SIGINT signals
 * Used by Cloud Run and container orchestrators
 */

import { Logger } from '../../config/logger';

const logger = Logger.getInstance();

interface ShutdownHandler {
  name: string;
  handler: () => Promise<void>;
  timeout?: number;
}

class GracefulShutdown {
  private static instance: GracefulShutdown;
  private handlers: ShutdownHandler[] = [];
  private isShuttingDown = false;
  private shutdownTimeout = 30000; // 30 seconds default

  private constructor() {
    // Register process signal handlers
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    process.on('uncaughtException', (error) => {
      logger.error('SHUTDOWN', 'Uncaught exception', error);
      this.shutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason) => {
      logger.error('SHUTDOWN', 'Unhandled rejection', reason);
      this.shutdown('unhandledRejection');
    });
  }

  static getInstance(): GracefulShutdown {
    if (!GracefulShutdown.instance) {
      GracefulShutdown.instance = new GracefulShutdown();
    }
    return GracefulShutdown.instance;
  }

  /**
   * Register a shutdown handler
   * Handlers are called in reverse order (LIFO)
   */
  registerHandler(handler: ShutdownHandler): void {
    this.handlers.unshift(handler);
    logger.debug('SHUTDOWN', `Registered shutdown handler: ${handler.name}`);
  }

  /**
   * Set global shutdown timeout
   */
  setTimeout(ms: number): void {
    this.shutdownTimeout = ms;
  }

  /**
   * Perform graceful shutdown
   */
  private async shutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('SHUTDOWN', 'Shutdown already in progress, forcing exit...');
      process.exit(1);
      return;
    }

    this.isShuttingDown = true;
    logger.info('SHUTDOWN', `Received ${signal}, starting graceful shutdown...`);

    // Set hard timeout
    const hardTimeout = setTimeout(() => {
      logger.error('SHUTDOWN', `Shutdown timeout after ${this.shutdownTimeout}ms, forcing exit`);
      process.exit(1);
    }, this.shutdownTimeout);

    try {
      // Execute all shutdown handlers
      for (const { name, handler, timeout } of this.handlers) {
        try {
          logger.info('SHUTDOWN', `Executing shutdown handler: ${name}`);

          const handlerTimeout = timeout || 5000;
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Handler ${name} timeout`)), handlerTimeout);
          });

          await Promise.race([handler(), timeoutPromise]);

          logger.success('SHUTDOWN', `Shutdown handler completed: ${name}`);
        } catch (error) {
          logger.error('SHUTDOWN', `Shutdown handler failed: ${name}`, error);
          // Continue with other handlers even if one fails
        }
      }

      logger.success('SHUTDOWN', 'Graceful shutdown completed');
      clearTimeout(hardTimeout);
      process.exit(0);
    } catch (error) {
      logger.error('SHUTDOWN', 'Shutdown failed', error);
      clearTimeout(hardTimeout);
      process.exit(1);
    }
  }

  /**
   * Common shutdown handlers for express servers
   */
  static createExpressHandler(server: unknown, name: string = 'Express Server'): ShutdownHandler {
    return {
      name,
      handler: async () => {
        return new Promise((resolve, reject) => {
          const srv = server as { close: (cb: (err?: Error) => void) => void };
          if (!srv || typeof srv.close !== 'function') {
            resolve();
            return;
          }
          srv.close((err: Error | undefined) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      },
      timeout: 10000,
    };
  }

  /**
   * Common shutdown handlers for Redis connections
   */
  static createRedisHandler(client: unknown, name: string = 'Redis Client'): ShutdownHandler {
    return {
      name,
      handler: async () => {
        const c = client as { quit?: () => Promise<void> };
        if (c && typeof c.quit === 'function') {
          await c.quit();
        }
      },
      timeout: 3000,
    };
  }

  /**
   * Common shutdown handlers for Bull queues
   */
  static createBullQueueHandler(queue: unknown, name: string = 'Bull Queue'): ShutdownHandler {
    return {
      name,
      handler: async () => {
        const q = queue as { close?: () => Promise<void> };
        if (q && typeof q.close === 'function') {
          await q.close();
        }
      },
      timeout: 5000,
    };
  }

  /**
   * Common shutdown handlers for browser instances
   */
  static createBrowserHandler(
    browser: unknown,
    name: string = 'Playwright Browser',
  ): ShutdownHandler {
    return {
      name,
      handler: async () => {
        const b = browser as { close?: () => Promise<void> };
        if (b && typeof b.close === 'function') {
          await b.close();
        }
      },
      timeout: 5000,
    };
  }

  /**
   * Generic shutdown handler
   */
  static createGenericHandler(
    name: string,
    handler: () => Promise<void>,
    timeout?: number,
  ): ShutdownHandler {
    return { name, handler, timeout };
  }
}

export default GracefulShutdown;
export { ShutdownHandler };
