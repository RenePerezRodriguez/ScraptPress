import { Logger } from '../../config/logger';
import { getFirestore } from '../../config/firebase';
import { RedisClientType } from 'redis';

interface MetricPoint {
  timestamp: Date;
  value: number;
}

interface SystemMetrics {
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  requestsPerSecond: number;
  averageResponseTime: number;
  errorRate: number;
  cacheHitRate: number;
  services?: {
    redis: {
      status: 'healthy' | 'unhealthy';
      latency?: number;
      error?: string;
    };
    firestore: {
      status: 'healthy' | 'unhealthy';
      latency?: number;
      error?: string;
    };
  };
}

// Import Redis client reference
let redisClientRef: RedisClientType | null = null;

/**
 * Set Redis client reference for health checks
 * Called from rateLimiter after initialization
 */
export function setRedisClient(client: RedisClientType) {
  redisClientRef = client;
}

export class MonitoringService {
  private static instance: MonitoringService;
  private logger = Logger.getInstance();
  private metrics = {
    requests: 0,
    errors: 0,
    totalResponseTime: 0,
    cacheHits: 0,
    totalCacheAttempts: 0,
    lastReset: Date.now(),
  };

  private metricsHistory: MetricPoint[] = [];
  private readonly HISTORY_LIMIT = 1440; // 24 hours at 1-minute intervals

  private constructor() {}

  static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  /**
   * Record a request
   */
  recordRequest(responseTime: number, success: boolean = true): void {
    this.metrics.requests++;
    this.metrics.totalResponseTime += responseTime;
    if (!success) {
      this.metrics.errors++;
    }
  }

  /**
   * Record cache hit/miss
   */
  recordCacheAttempt(hit: boolean = true): void {
    this.metrics.totalCacheAttempts++;
    if (hit) {
      this.metrics.cacheHits++;
    }
  }

  /**
   * Get current system metrics
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const timeSinceReset = (Date.now() - this.metrics.lastReset) / 1000; // seconds
    const requestsPerSecond = this.metrics.requests / timeSinceReset;
    const averageResponseTime =
      this.metrics.requests > 0 ? this.metrics.totalResponseTime / this.metrics.requests : 0;
    const errorRate = this.metrics.requests > 0 ? this.metrics.errors / this.metrics.requests : 0;
    const cacheHitRate =
      this.metrics.totalCacheAttempts > 0
        ? this.metrics.cacheHits / this.metrics.totalCacheAttempts
        : 0;

    // Check service health
    const services = {
      redis: await this.checkRedisHealth(),
      firestore: await this.checkFirestoreHealth(),
    };

    return {
      uptime,
      memoryUsage,
      cpuUsage,
      requestsPerSecond,
      averageResponseTime,
      errorRate,
      cacheHitRate,
      services,
    };
  }

  /**
   * Check Redis health
   */
  private async checkRedisHealth(): Promise<{
    status: 'healthy' | 'unhealthy';
    latency?: number;
    error?: string;
  }> {
    try {
      if (!redisClientRef) {
        throw new Error('Redis client not initialized');
      }

      const start = Date.now();
      await redisClientRef.ping();
      const latency = Date.now() - start;

      return { status: 'healthy', latency };
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.warn('HEALTH', 'Redis health check failed', err);
      return {
        status: 'unhealthy',
        error: err.message,
      };
    }
  }

  /**
   * Check Firestore health
   */
  private async checkFirestoreHealth(): Promise<{
    status: 'healthy' | 'unhealthy';
    latency?: number;
    error?: string;
  }> {
    try {
      const start = Date.now();
      const db = getFirestore();

      // Simple read operation to verify connection
      await db.collection('_health_check').doc('ping').get();
      const latency = Date.now() - start;

      return { status: 'healthy', latency };
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.warn('HEALTH', 'Firestore health check failed', err);
      return {
        status: 'unhealthy',
        error: err.message,
      };
    }
  }

  /**
   * Get health status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    metrics: SystemMetrics;
    warnings: string[];
  }> {
    const metrics = await this.getSystemMetrics();
    const warnings: string[] = [];

    // Check memory usage
    const heapUsagePercent = (metrics.memoryUsage.heapUsed / metrics.memoryUsage.heapTotal) * 100;
    if (heapUsagePercent > 95) {
      warnings.push(`⚠️ High memory usage: ${heapUsagePercent.toFixed(2)}%`);
    }

    // Check error rate
    if (metrics.errorRate > 0.05) {
      warnings.push(`⚠️ High error rate: ${(metrics.errorRate * 100).toFixed(2)}%`);
    }

    // Check response time
    if (metrics.averageResponseTime > 5000) {
      warnings.push(`⚠️ High average response time: ${metrics.averageResponseTime.toFixed(2)}ms`);
    }

    // Check service health
    if (metrics.services?.redis.status === 'unhealthy') {
      warnings.push(`⚠️ Redis unhealthy: ${metrics.services.redis.error}`);
    }

    if (metrics.services?.firestore.status === 'unhealthy') {
      warnings.push(`⚠️ Firestore unhealthy: ${metrics.services.firestore.error}`);
    }

    // Determine status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Critical: Any service down = unhealthy
    if (
      metrics.services?.redis.status === 'unhealthy' ||
      metrics.services?.firestore.status === 'unhealthy'
    ) {
      status = 'unhealthy';
    } else if (warnings.length > 0 && heapUsagePercent > 85) {
      status = 'unhealthy';
    } else if (warnings.length > 0) {
      status = 'degraded';
    }

    return { status, metrics, warnings };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      requests: 0,
      errors: 0,
      totalResponseTime: 0,
      cacheHits: 0,
      totalCacheAttempts: 0,
      lastReset: Date.now(),
    };
    this.logger.info('📊 Metrics reset');
  }

  /**
   * Log metrics periodically
   */
  async startPeriodicLogging(_intervalMs: number = 60000): Promise<void> {
    const health = await this.getHealthStatus();

    this.logger.info('METRICS', '📊 System Metrics', {
      uptime: `${(health.metrics.uptime / 60).toFixed(2)} minutes`,
      memory: `${(health.metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB / ${(health.metrics.memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      rps: health.metrics.requestsPerSecond.toFixed(2),
      avgResponseTime: `${health.metrics.averageResponseTime.toFixed(2)}ms`,
      errorRate: `${(health.metrics.errorRate * 100).toFixed(2)}%`,
      cacheHitRate: `${(health.metrics.cacheHitRate * 100).toFixed(2)}%`,
      redis: health.metrics.services?.redis.status,
      firestore: health.metrics.services?.firestore.status,
      status: health.status,
    });

    if (health.warnings.length > 0) {
      health.warnings.forEach((w) => this.logger.warn(w));
    }

    // Store in history
    this.metricsHistory.push({
      timestamp: new Date(),
      value: health.metrics.requestsPerSecond,
    });

    if (this.metricsHistory.length > this.HISTORY_LIMIT) {
      this.metricsHistory.shift();
    }
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(): MetricPoint[] {
    return [...this.metricsHistory];
  }
}

export default MonitoringService;
