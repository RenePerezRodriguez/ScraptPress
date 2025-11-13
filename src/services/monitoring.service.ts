import { Logger } from '../config/logger';

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
  getSystemMetrics(): SystemMetrics {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const timeSinceReset = (Date.now() - this.metrics.lastReset) / 1000; // seconds
    const requestsPerSecond = this.metrics.requests / timeSinceReset;
    const averageResponseTime =
      this.metrics.requests > 0
        ? this.metrics.totalResponseTime / this.metrics.requests
        : 0;
    const errorRate =
      this.metrics.requests > 0 ? this.metrics.errors / this.metrics.requests : 0;
    const cacheHitRate =
      this.metrics.totalCacheAttempts > 0
        ? this.metrics.cacheHits / this.metrics.totalCacheAttempts
        : 0;

    return {
      uptime,
      memoryUsage,
      cpuUsage,
      requestsPerSecond,
      averageResponseTime,
      errorRate,
      cacheHitRate,
    };
  }

  /**
   * Get health status
   */
  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    metrics: SystemMetrics;
    warnings: string[];
  } {
    const metrics = this.getSystemMetrics();
    const warnings: string[] = [];

    // Check memory usage
    const heapUsagePercent =
      (metrics.memoryUsage.heapUsed / metrics.memoryUsage.heapTotal) * 100;
    if (heapUsagePercent > 90) {
      warnings.push(`⚠️ High memory usage: ${heapUsagePercent.toFixed(2)}%`);
    }

    // Check error rate
    if (metrics.errorRate > 0.05) {
      warnings.push(`⚠️ High error rate: ${(metrics.errorRate * 100).toFixed(2)}%`);
    }

    // Check response time
    if (metrics.averageResponseTime > 5000) {
      warnings.push(
        `⚠️ High average response time: ${metrics.averageResponseTime.toFixed(2)}ms`
      );
    }

    // Determine status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (warnings.length > 0 && heapUsagePercent > 85) {
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
  startPeriodicLogging(intervalMs: number = 60000): void {
    const health = this.getHealthStatus();

    this.logger.info('📊 System Metrics', {
      uptime: `${(health.metrics.uptime / 60).toFixed(2)} minutes`,
      memory: `${(health.metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB / ${(health.metrics.memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      rps: health.metrics.requestsPerSecond.toFixed(2),
      avgResponseTime: `${health.metrics.averageResponseTime.toFixed(2)}ms`,
      errorRate: `${(health.metrics.errorRate * 100).toFixed(2)}%`,
      cacheHitRate: `${(health.metrics.cacheHitRate * 100).toFixed(2)}%`,
      status: health.status,
    });

    if (health.warnings.length > 0) {
      health.warnings.forEach(w => this.logger.warn(w));
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
