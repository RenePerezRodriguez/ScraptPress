/**
 * Job Queue Security Service
 * Prevents abuse of the asynchronous job queue system
 *
 * Security measures:
 * - Rate limiting per IP and API key
 * - Max concurrent jobs per user
 * - Query validation and sanitization
 * - Priority management
 * - Job timeout enforcement
 */

import { CacheService } from '../cache.service';
import { Logger } from '../../config/logger';
import type { SecurityStats } from '../../types';

const logger = Logger.getInstance();
const cache = CacheService.getInstance();

// Security configuration
const SECURITY_CONFIG = {
  // Rate limits per IP (requests per time window)
  rateLimits: {
    perIp: {
      maxRequests: parseInt(process.env.RATE_LIMIT_IP || '10'), // 10 requests
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000'), // per minute
    },
    perApiKey: {
      maxRequests: parseInt(process.env.RATE_LIMIT_API_KEY || '100'), // 100 requests
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000'), // per minute
    },
  },

  // Max concurrent jobs
  maxConcurrentJobs: {
    perIp: parseInt(process.env.MAX_JOBS_PER_IP || '3'), // 3 concurrent jobs
    perApiKey: parseInt(process.env.MAX_JOBS_PER_API_KEY || '10'), // 10 concurrent jobs
  },

  // Query validation
  queryValidation: {
    minLength: 2,
    maxLength: 100,
    allowedPattern: /^[a-zA-Z0-9\s\-_.,()]+$/, // Alphanumeric + common symbols
    blacklist: ['<script>', 'javascript:', 'onerror=', 'onclick='],
  },

  // Job limits
  jobLimits: {
    maxLimit: parseInt(process.env.MAX_SCRAPE_LIMIT || '100'), // Max vehicles per job
    minLimit: 1,
    maxPage: parseInt(process.env.MAX_PAGE_NUMBER || '50'), // Max page number
  },
};

export interface SecurityCheckResult {
  allowed: boolean;
  reason?: string;
  retryAfterSeconds?: number;
}

export class JobQueueSecurityService {
  private static instance: JobQueueSecurityService;

  private constructor() {}

  static getInstance(): JobQueueSecurityService {
    if (!JobQueueSecurityService.instance) {
      JobQueueSecurityService.instance = new JobQueueSecurityService();
    }
    return JobQueueSecurityService.instance;
  }

  /**
   * Check if client can submit a new job
   */
  async canSubmitJob(clientIp: string, apiKey?: string): Promise<SecurityCheckResult> {
    // Check rate limit
    const rateLimitCheck = await this.checkRateLimit(clientIp, apiKey);
    if (!rateLimitCheck.allowed) {
      return rateLimitCheck;
    }

    // Check concurrent jobs
    const concurrencyCheck = await this.checkConcurrentJobs(clientIp, apiKey);
    if (!concurrencyCheck.allowed) {
      return concurrencyCheck;
    }

    return { allowed: true };
  }

  /**
   * Check rate limit for IP or API key
   */
  private async checkRateLimit(clientIp: string, apiKey?: string): Promise<SecurityCheckResult> {
    const identifier = apiKey || clientIp;
    const config = apiKey ? SECURITY_CONFIG.rateLimits.perApiKey : SECURITY_CONFIG.rateLimits.perIp;

    const cacheKey = `ratelimit:${identifier}`;

    try {
      // Get current request count
      const currentCount = (await cache.get<number>(cacheKey)) || 0;

      if (currentCount >= config.maxRequests) {
        const retryAfter = Math.ceil(config.windowMs / 1000);
        logger.warn(`Rate limit exceeded for ${identifier}: ${currentCount}/${config.maxRequests}`);

        return {
          allowed: false,
          reason: `Rate limit exceeded. Max ${config.maxRequests} requests per ${retryAfter}s`,
          retryAfterSeconds: retryAfter,
        };
      }

      // Increment counter
      await cache.set(cacheKey, currentCount + 1, Math.ceil(config.windowMs / 1000));

      return { allowed: true };
    } catch (error) {
      logger.error('Rate limit check error:', error);
      // On error, allow request (fail open)
      return { allowed: true };
    }
  }

  /**
   * Check concurrent jobs limit
   */
  private async checkConcurrentJobs(
    clientIp: string,
    apiKey?: string,
  ): Promise<SecurityCheckResult> {
    const identifier = apiKey || clientIp;
    const maxJobs = apiKey
      ? SECURITY_CONFIG.maxConcurrentJobs.perApiKey
      : SECURITY_CONFIG.maxConcurrentJobs.perIp;

    const cacheKey = `concurrent:${identifier}`;

    try {
      const currentJobs = (await cache.get<number>(cacheKey)) || 0;

      if (currentJobs >= maxJobs) {
        logger.warn(`Max concurrent jobs exceeded for ${identifier}: ${currentJobs}/${maxJobs}`);

        return {
          allowed: false,
          reason: `Maximum ${maxJobs} concurrent jobs per ${apiKey ? 'API key' : 'IP'}. Please wait for existing jobs to complete.`,
        };
      }

      return { allowed: true };
    } catch (error) {
      logger.error('Concurrent jobs check error:', error);
      return { allowed: true };
    }
  }

  /**
   * Increment concurrent job counter
   */
  async incrementConcurrentJobs(clientIp: string, apiKey?: string): Promise<void> {
    const identifier = apiKey || clientIp;
    const cacheKey = `concurrent:${identifier}`;

    try {
      const current = (await cache.get<number>(cacheKey)) || 0;
      await cache.set(cacheKey, current + 1, 3600); // 1 hour TTL
    } catch (error) {
      logger.error('Error incrementing concurrent jobs:', error);
    }
  }

  /**
   * Decrement concurrent job counter
   */
  async decrementConcurrentJobs(clientIp: string, apiKey?: string): Promise<void> {
    const identifier = apiKey || clientIp;
    const cacheKey = `concurrent:${identifier}`;

    try {
      const current = (await cache.get<number>(cacheKey)) || 0;
      if (current > 0) {
        await cache.set(cacheKey, current - 1, 3600);
      }
    } catch (error) {
      logger.error('Error decrementing concurrent jobs:', error);
    }
  }

  /**
   * Validate and sanitize query
   */
  validateQuery(query: string): { valid: boolean; sanitized?: string; reason?: string } {
    // Check length
    if (!query || query.length < SECURITY_CONFIG.queryValidation.minLength) {
      return {
        valid: false,
        reason: `Query too short. Minimum ${SECURITY_CONFIG.queryValidation.minLength} characters`,
      };
    }

    if (query.length > SECURITY_CONFIG.queryValidation.maxLength) {
      return {
        valid: false,
        reason: `Query too long. Maximum ${SECURITY_CONFIG.queryValidation.maxLength} characters`,
      };
    }

    // Check for blacklisted patterns (XSS, injection attempts)
    const lowerQuery = query.toLowerCase();
    for (const blacklisted of SECURITY_CONFIG.queryValidation.blacklist) {
      if (lowerQuery.includes(blacklisted.toLowerCase())) {
        logger.warn(`Blocked malicious query: ${query}`);
        return {
          valid: false,
          reason: 'Query contains forbidden patterns',
        };
      }
    }

    // Check allowed characters
    if (!SECURITY_CONFIG.queryValidation.allowedPattern.test(query)) {
      return {
        valid: false,
        reason: 'Query contains invalid characters. Only alphanumeric and basic symbols allowed',
      };
    }

    // Sanitize: trim and normalize
    const sanitized = query.trim().replace(/\s+/g, ' ');

    return {
      valid: true,
      sanitized,
    };
  }

  /**
   * Validate pagination parameters
   */
  validatePagination(page: number, limit: number): { valid: boolean; reason?: string } {
    // Validate page
    if (!Number.isInteger(page) || page < 1) {
      return {
        valid: false,
        reason: 'Page must be a positive integer',
      };
    }

    if (page > SECURITY_CONFIG.jobLimits.maxPage) {
      return {
        valid: false,
        reason: `Page number too high. Maximum ${SECURITY_CONFIG.jobLimits.maxPage}`,
      };
    }

    // Validate limit
    if (!Number.isInteger(limit) || limit < SECURITY_CONFIG.jobLimits.minLimit) {
      return {
        valid: false,
        reason: `Limit must be at least ${SECURITY_CONFIG.jobLimits.minLimit}`,
      };
    }

    if (limit > SECURITY_CONFIG.jobLimits.maxLimit) {
      return {
        valid: false,
        reason: `Limit too high. Maximum ${SECURITY_CONFIG.jobLimits.maxLimit} per request`,
      };
    }

    return { valid: true };
  }

  /**
   * Calculate job priority based on client tier
   */
  calculatePriority(apiKey?: string, limit?: number): 'high' | 'normal' | 'low' {
    // Premium API keys get high priority
    const premiumKeys = (process.env.PREMIUM_API_KEYS || '').split(',').filter(Boolean);
    if (apiKey && premiumKeys.includes(apiKey)) {
      return 'high';
    }

    // Small requests get normal priority
    if (limit && limit <= 20) {
      return 'normal';
    }

    // Large requests get low priority
    return 'low';
  }

  /**
   * Get security statistics
   */
  async getSecurityStats(): Promise<SecurityStats> {
    return {
      config: {
        rateLimits: SECURITY_CONFIG.rateLimits,
        maxConcurrentJobs: SECURITY_CONFIG.maxConcurrentJobs,
        jobLimits: SECURITY_CONFIG.jobLimits,
      },
      validation: {
        queryMinLength: SECURITY_CONFIG.queryValidation.minLength,
        queryMaxLength: SECURITY_CONFIG.queryValidation.maxLength,
        maxPage: SECURITY_CONFIG.jobLimits.maxPage,
        maxLimit: SECURITY_CONFIG.jobLimits.maxLimit,
      },
    };
  }
}

export default JobQueueSecurityService;
