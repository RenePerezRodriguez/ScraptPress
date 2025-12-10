/**
 * RetryOrchestrator - Manages retry logic and backoff strategies
 * Single Responsibility: Retry coordination and error recovery
 */

import { Logger } from '../../../../../config/logger';

const logger = Logger.getInstance();

export interface RetryOptions {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  onRetry?: (attempt: number, error: unknown) => void | Promise<void>;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: unknown;
  attempts: number;
  totalDuration: number;
}

export class RetryOrchestrator {
  private defaultOptions: RetryOptions = {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
  };

  /**
   * Execute function with exponential backoff retry
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    options?: Partial<RetryOptions>,
  ): Promise<RetryResult<T>> {
    const opts = { ...this.defaultOptions, ...options };
    const startTime = Date.now();
    let lastError: unknown;

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
      try {
        logger.debug(`🔄 Attempt ${attempt}/${opts.maxAttempts}`);
        const data = await fn();

        const totalDuration = Date.now() - startTime;
        logger.info(`✅ Success on attempt ${attempt} (${totalDuration}ms)`);

        return {
          success: true,
          data,
          attempts: attempt,
          totalDuration,
        };
      } catch (error: unknown) {
        lastError = error;
        logger.warn(`❌ Attempt ${attempt} failed: ${error}`);

        if (attempt < opts.maxAttempts) {
          const delay = this.calculateDelay(attempt, opts);
          logger.info(`⏳ Retrying in ${delay}ms...`);

          if (opts.onRetry) {
            await opts.onRetry(attempt, error);
          }

          await this.sleep(delay);
        }
      }
    }

    const totalDuration = Date.now() - startTime;
    logger.error(`❌ All ${opts.maxAttempts} attempts failed (${totalDuration}ms)`);

    return {
      success: false,
      error: lastError,
      attempts: opts.maxAttempts,
      totalDuration,
    };
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateDelay(attempt: number, options: RetryOptions): number {
    const delay = options.initialDelay * Math.pow(options.backoffMultiplier, attempt - 1);
    return Math.min(delay, options.maxDelay);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Execute with retry and custom recovery strategy
   */
  async executeWithRecovery<T>(
    fn: () => Promise<T>,
    recoveryFn?: (attempt: number) => Promise<void>,
    options?: Partial<RetryOptions>,
  ): Promise<RetryResult<T>> {
    return this.executeWithRetry(fn, {
      ...options,
      onRetry: recoveryFn,
    });
  }

  /**
   * Execute multiple strategies in sequence until one succeeds
   */
  async executeStrategies<T>(
    strategies: Array<() => Promise<T>>,
    strategyNames?: string[],
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();
    let lastError: unknown;

    for (let i = 0; i < strategies.length; i++) {
      const strategyName = strategyNames?.[i] || `Strategy ${i + 1}`;

      try {
        logger.info(`Trying ${strategyName}...`);
        const data = await strategies[i]();

        const totalDuration = Date.now() - startTime;
        logger.info(`✅ ${strategyName} succeeded (${totalDuration}ms)`);

        return {
          success: true,
          data,
          attempts: i + 1,
          totalDuration,
        };
      } catch (error: unknown) {
        lastError = error;
        logger.warn(`❌ ${strategyName} failed: ${error}`);
      }
    }

    const totalDuration = Date.now() - startTime;
    logger.error(`❌ All ${strategies.length} strategies failed (${totalDuration}ms)`);

    return {
      success: false,
      error: lastError,
      attempts: strategies.length,
      totalDuration,
    };
  }
}
