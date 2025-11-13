import { Request, Response, NextFunction } from 'express';
import redis from 'redis';
import { Logger } from '../../config/logger';

const logger = Logger.getInstance();

// Cliente Redis (opcional - puede fallover a memoria si no está disponible)
let redisClient: ReturnType<typeof redis.createClient> | null = null;

// Fallback a memoria si Redis no está disponible
const memoryStore = new Map<string, { count: number; resetTime: number }>();

export async function initializeRedis() {
  try {
    redisClient = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      password: process.env.REDIS_PASSWORD,
    });

    redisClient.on('error', (err: Error) => {
      logger.warn('Redis connection error, falling back to memory:', err.message);
      redisClient = null;
    });

    await redisClient.connect();
    logger.info('✅ Redis connected for rate limiting');
  } catch (err) {
    logger.warn('Redis not available, using in-memory rate limiting');
    redisClient = null;
  }
}

interface RateLimitOptions {
  windowMs?: number; // Time window in milliseconds (default: 60000 = 1 minute)
  maxRequests?: number; // Max requests per window (default: 30)
  keyGenerator?: (req: Request) => string; // Custom key generator
  skipSuccessfulRequests?: boolean; // Skip counting successful requests
  skipFailedRequests?: boolean; // Skip counting failed requests
}

export function rateLimiter(options: RateLimitOptions = {}) {
  const {
    windowMs = 60000,
    maxRequests = 30,
    keyGenerator = (req: Request) => req.ip || 'unknown',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `rate-limit:${keyGenerator(req)}`;
    const now = Date.now();
    const resetTime = now + windowMs;

    try {
      let current = 0;
      let remaining = maxRequests;

      if (redisClient) {
        // Use Redis
        const data = await redisClient.get(key);
        if (data) {
          const parsed = JSON.parse(data);
          // Reset if window expired
          if (parsed.resetTime > now) {
            current = parsed.count;
          } else {
            current = 0;
          }
        }

        if (current >= maxRequests) {
          res.status(429).set({
            'Retry-After': Math.ceil((resetTime - now) / 1000),
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': resetTime.toString(),
          }).json({
            error: 'Too many requests',
            retryAfter: Math.ceil((resetTime - now) / 1000),
            details: `Rate limit: ${maxRequests} requests per ${Math.ceil(windowMs / 1000)} seconds`,
          });
          return;
        }

        current++;
        remaining = maxRequests - current;

        // Store in Redis with expiration
        await redisClient.setEx(
          key,
          Math.ceil(windowMs / 1000),
          JSON.stringify({ count: current, resetTime })
        );
      } else {
        // Fallback to memory
        const data = memoryStore.get(key);
        if (data && data.resetTime > now) {
          current = data.count;
        } else {
          current = 0;
          memoryStore.delete(key);
        }

        if (current >= maxRequests) {
          res.status(429).set({
            'Retry-After': Math.ceil((resetTime - now) / 1000),
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': resetTime.toString(),
          }).json({
            error: 'Too many requests',
            retryAfter: Math.ceil((resetTime - now) / 1000),
            details: `Rate limit: ${maxRequests} requests per ${Math.ceil(windowMs / 1000)} seconds`,
          });
          return;
        }

        current++;
        remaining = maxRequests - current;
        memoryStore.set(key, { count: current, resetTime });
      }

      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': resetTime.toString(),
      });

      next();
    } catch (error) {
      logger.error('Rate limiting error:', error);
      next(); // Continue on error
    }
  };
}

// Preset configurations
export const rateLimitPresets = {
  // 30 requests per minute (general)
  strict: () => rateLimiter({
    windowMs: 60000,
    maxRequests: 30,
  }),

  // 100 requests per minute (normal)
  normal: () => rateLimiter({
    windowMs: 60000,
    maxRequests: 100,
  }),

  // 300 requests per hour (relaxed)
  relaxed: () => rateLimiter({
    windowMs: 3600000,
    maxRequests: 300,
  }),

  // 5 requests per minute (API scraping - very strict)
  scraping: () => rateLimiter({
    windowMs: 60000,
    maxRequests: 5,
  }),
};
