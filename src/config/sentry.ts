/**
 * Sentry Error Tracking Configuration
 * Provides centralized error monitoring and performance tracking
 */

import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { Express, Request, Response, NextFunction } from 'express';
import { Logger } from './logger';

const logger = Logger.getInstance();

export class SentryService {
  private static initialized = false;

  /**
   * Initialize Sentry with configuration
   */
  static init(_app?: Express): void {
    if (this.initialized) {
      logger.warn('Sentry already initialized');
      return;
    }

    const sentryDsn = process.env.SENTRY_DSN;
    const environment = process.env.NODE_ENV || 'development';

    if (!sentryDsn) {
      logger.warn('⚠️ SENTRY_DSN not configured - error tracking disabled');
      return;
    }

    try {
      Sentry.init({
        dsn: sentryDsn,
        environment,

        // Performance Monitoring
        tracesSampleRate: environment === 'production' ? 0.1 : 1.0, // 10% in prod, 100% in dev

        // Profiling
        profilesSampleRate: environment === 'production' ? 0.1 : 1.0,
        integrations: [nodeProfilingIntegration()],

        // Release tracking
        release: process.env.npm_package_version,

        // Error filtering
        beforeSend(event, hint) {
          // Don't send errors in development
          if (environment === 'development') {
            console.error('Sentry Error (dev):', hint.originalException || hint.syntheticException);
            return null;
          }

          // Filter out specific errors
          const error = hint.originalException;
          if (error && error instanceof Error) {
            // Ignore rate limit errors
            if (error.message.includes('Too Many Requests')) {
              return null;
            }

            // Ignore expected validation errors
            if (error.message.includes('Validation failed')) {
              return null;
            }
          }

          return event;
        },

        // Additional context
        initialScope: {
          tags: {
            service: 'scraptpress-api',
            version: process.env.npm_package_version || 'unknown',
          },
        },
      });

      this.initialized = true;
      logger.info('✅ Sentry initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Sentry:', error);
    }
  }

  /**
   * Error handler middleware (must be added AFTER all routes)
   */
  static errorHandler() {
    return (err: Error, req: Request, res: Response, next: NextFunction) => {
      if (this.initialized) {
        Sentry.captureException(err);
      }
      next(err);
    };
  }

  /**
   * Capture exception manually
   */
  static captureException(error: Error, context?: Record<string, unknown>): void {
    if (!this.initialized) {
      logger.error('Sentry not initialized, logging error locally:', error);
      return;
    }

    Sentry.captureException(error, {
      extra: context,
    });
  }

  /**
   * Capture message
   */
  static captureMessage(message: string, level: Sentry.SeverityLevel = 'info'): void {
    if (!this.initialized) {
      return;
    }

    Sentry.captureMessage(message, level);
  }

  /**
   * Set user context
   */
  static setUser(user: { id?: string; email?: string; ipAddress?: string }): void {
    if (!this.initialized) {
      return;
    }

    Sentry.setUser(user);
  }

  /**
   * Add breadcrumb for debugging
   */
  static addBreadcrumb(message: string, data?: Record<string, unknown>): void {
    if (!this.initialized) {
      return;
    }

    Sentry.addBreadcrumb({
      message,
      data,
      level: 'info',
      timestamp: Date.now() / 1000,
    });
  }

  /**
   * Start transaction for performance monitoring
   */
  static startTransaction(name: string, op: string): unknown {
    if (!this.initialized) {
      return null;
    }

    return Sentry.startSpan({ name, op }, (span) => span);
  }

  /**
   * Flush events (useful before shutdown)
   */
  static async flush(timeout: number = 2000): Promise<boolean> {
    if (!this.initialized) {
      return true;
    }

    try {
      await Sentry.flush(timeout);
      return true;
    } catch (error) {
      logger.error('Error flushing Sentry:', error);
      return false;
    }
  }

  /**
   * Close Sentry client
   */
  static async close(timeout: number = 2000): Promise<boolean> {
    if (!this.initialized) {
      return true;
    }

    try {
      await Sentry.close(timeout);
      this.initialized = false;
      logger.info('Sentry closed');
      return true;
    } catch (error) {
      logger.error('Error closing Sentry:', error);
      return false;
    }
  }
}

export default SentryService;
