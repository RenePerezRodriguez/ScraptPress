import { Request, Response, NextFunction } from 'express';
import { createClient, RedisClientType } from 'redis';
import { Logger } from '../../config/logger';
import { setRedisClient } from '../../services/infrastructure/monitoring.service';

const logger = Logger.getInstance();

// Cliente Redis (OBLIGATORIO)
let redisClient: RedisClientType | null = null;

export async function initializeRedis() {
  if (!process.env.REDIS_HOST) {
    logger.warn('REDIS_HOST not set, using in-memory rate limiting');
    return;
  }

  try {
    redisClient = createClient({
      socket: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      password: process.env.REDIS_PASSWORD,
    });

    redisClient.on('error', (err: Error) => {
      // Do not throw here, it crashes the app. Just log it.
      // The connect() promise will reject if initial connection fails.
      logger.warn('Redis client error:', err.message);
    });

    await redisClient.connect();
    logger.info('✅ Redis connected for rate limiting');

    // Share Redis client with monitoring service for health checks
    setRedisClient(redisClient);
  } catch (err) {
    logger.error('Failed to connect to Redis:', err);
    throw new Error('Redis connection required for rate limiting');
  }
}

interface RateLimitOptions {
  windowMs?: number; // Time window in milliseconds (default: 60000 = 1 minute)
  maxRequests?: number; // Max requests per window (default: 30)
  keyGenerator?: (req: Request) => string; // Custom key generator
  skipSuccessfulRequests?: boolean; // Skip counting successful requests
  skipFailedRequests?: boolean; // Skip counting failed requests
}

// Fallback memory store for development/when Redis is down
const memoryStore = new Map<string, { count: number; resetTime: number }>();

export function rateLimiter(options: RateLimitOptions = {}) {
  const {
    windowMs = 60000,
    maxRequests = 30,
    keyGenerator = (req: Request) => req.ip || 'unknown',
    skipSuccessfulRequests: _skipSuccessfulRequests = false,
    skipFailedRequests: _skipFailedRequests = false,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `rate-limit:${keyGenerator(req)}`;
    const now = Date.now();
    const resetTime = now + windowMs;

    try {
      let current = 0;
      let storedResetTime = resetTime;

      // Use Redis if available
      if (redisClient && redisClient.isOpen) {
        const data = await redisClient.get(key);
        if (data) {
          const parsed = JSON.parse(data);
          if (parsed.resetTime > now) {
            current = parsed.count;
            storedResetTime = parsed.resetTime;
          }
        }
      } else {
        // Fallback to Memory Store
        const data = memoryStore.get(key);
        if (data) {
          if (data.resetTime > now) {
            current = data.count;
            storedResetTime = data.resetTime;
          } else {
            memoryStore.delete(key);
          }
        }
      }

      // Check if rate limit exceeded
      if (current >= maxRequests) {
        // ... (logging omitted for brevity in fallback logic)
        return res
          .status(429)
          .set({
            'Retry-After': Math.ceil((storedResetTime - now) / 1000),
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': storedResetTime.toString(),
          })
          .json({
            error: 'Too many requests',
            retryAfter: Math.ceil((storedResetTime - now) / 1000),
            details: `Rate limit: ${maxRequests} requests per window`,
          });
      }

      // Increment counter
      current++;
      const remaining = maxRequests - current;

      if (redisClient && redisClient.isOpen) {
        await redisClient.setEx(
          key,
          Math.ceil(windowMs / 1000),
          JSON.stringify({ count: current, resetTime: storedResetTime }),
        );
      } else {
        memoryStore.set(key, { count: current, resetTime: storedResetTime });
        // Simple cleanup: delete if array too big (optional, skipping for now)
      }

      res.set({
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': storedResetTime.toString(),
      });

      return next();
    } catch (error) {
      logger.warn('RATE-LIMIT', 'Rate limit error (permitting request):', error);
      next();
    }
  };
}

// Preset configurations
export const rateLimitPresets = {
  // 30 requests per minute (general)
  strict: () =>
    rateLimiter({
      windowMs: 60000,
      maxRequests: 30,
    }),

  // 100 requests per minute (normal)
  normal: () =>
    rateLimiter({
      windowMs: 60000,
      maxRequests: 100,
    }),

  // 300 requests per hour (relaxed)
  relaxed: () =>
    rateLimiter({
      windowMs: 3600000,
      maxRequests: 300,
    }),

  // 5 requests per minute (API scraping - very strict)
  scraping: () =>
    rateLimiter({
      windowMs: 60000,
      maxRequests: 5,
    }),
};
