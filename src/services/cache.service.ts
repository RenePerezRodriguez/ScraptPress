/**
 * Cache Service using Redis
 * Provides caching for vehicle data and search results
 */

import { createClient, RedisClientType } from 'redis';
import { Logger } from '../config/logger';
import type { CacheStats } from '../types';

const logger = Logger.getInstance();

export class CacheService {
  private static instance: CacheService;
  private client: RedisClientType | null = null;
  private isConnected: boolean = false;

  private constructor() { }

  static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  /**
   * Initialize Redis connection
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    try {
      const redisHost = process.env.REDIS_HOST || 'localhost';
      const redisPort = parseInt(process.env.REDIS_PORT || '6379');
      const redisUsername = process.env.REDIS_USERNAME;
      const redisPassword = process.env.REDIS_PASSWORD;
      const redisTls = process.env.REDIS_TLS === 'true';

      logger.info(`Connecting to Redis at ${redisHost}:${redisPort} (TLS: ${redisTls})`);

      this.client = createClient({
        username: redisUsername || undefined,
        password: redisPassword || undefined,
        socket: redisTls
          ? {
            host: redisHost,
            port: redisPort,
            tls: true,
          }
          : {
            host: redisHost,
            port: redisPort,
          },
      });

      this.client.on('error', (err) => {
        logger.error('Redis client error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('📦 Redis connected successfully');
        this.isConnected = true;
      });

      this.client.on('disconnect', () => {
        logger.warn('Redis disconnected');
        this.isConnected = false;
      });

      await this.client.connect();
    } catch (error: unknown) {
      logger.warn('Redis connection failed, caching disabled:', error);
      this.isConnected = false;
    }
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected || !this.client) {
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (!value) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (error: unknown) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set(key: string, value: unknown, ttlSeconds: number = 3600): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      const serialized = JSON.stringify(value);
      await this.client.setEx(key, ttlSeconds, serialized);
      return true;
    } catch (error: unknown) {
      logger.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  async del(key: string): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      await this.client.del(key);
      return true;
    } catch (error: unknown) {
      logger.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key: string): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result > 0;
    } catch (error: unknown) {
      logger.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Cache search results
   * TTL: 1 hour (search results change frequently)
   */
  async cacheSearchResults(query: string, page: number, count: number, results: unknown): Promise<void> {
    const key = `search:${query}:${page}:${count}`;
    await this.set(key, results, 3600); // 1 hour
    logger.debug(`Cached search results for: ${query} (page ${page})`);
  }

  /**
   * Get cached search results
   */
  async getCachedSearchResults(query: string, page: number, count: number): Promise<unknown | null> {
    const key = `search:${query}:${page}:${count}`;
    const cached = await this.get(key);
    if (cached) {
      logger.debug(`Cache HIT (Redis) for search: ${query} (page ${page})`);
    }
    return cached;
  }

  /**
   * Cache vehicle details
   * TTL: 24 hours (vehicle details change less frequently)
   */
  async cacheVehicle(lotNumber: string, data: unknown): Promise<void> {
    const key = `vehicle:${lotNumber}`;
    await this.set(key, data, 86400); // 24 hours
    logger.debug(`Cached vehicle: ${lotNumber}`);
  }

  /**
   * Get cached vehicle details
   */
  async getCachedVehicle(lotNumber: string): Promise<unknown | null> {
    const key = `vehicle:${lotNumber}`;
    const cached = await this.get(key);
    if (cached) {
      logger.debug(`Cache HIT for vehicle: ${lotNumber}`);
    }
    return cached;
  }

  /**
   * Clear all cache
   */
  async flushAll(): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      await this.client.flushAll();
      logger.info('Cache flushed successfully');
      return true;
    } catch (error: unknown) {
      logger.error('Cache flush error:', error);
      return false;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      this.isConnected = false;
      logger.info('Redis disconnected');
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    if (!this.isConnected || !this.client) {
      return { connected: false };
    }

    try {
      const info = await this.client.info();
      return {
        connected: true,
        info: info,
      };
    } catch (error: unknown) {
      logger.error('Cache stats error:', error);
      return { connected: false, error };
    }
  }
}

export default CacheService;
