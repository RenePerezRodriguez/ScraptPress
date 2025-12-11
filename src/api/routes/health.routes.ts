import { Router, Request, Response } from 'express';
import { MonitoringService } from '../../services/infrastructure/monitoring.service';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
const monitoring = MonitoringService.getInstance();

/**
 * GET /api/health
 * Check server health status
 *
 * Operation: getHealthStatus
 */
router.get(
  '/health',
  asyncHandler(async (req: Request, res: Response) => {
    const health = await monitoring.getHealthStatus();

    res.status(health.status === 'unhealthy' ? 503 : 200).json({
      timestamp: new Date().toISOString(),
      status: health.status,
      uptime: health.metrics.uptime,
      memoryUsage: {
        heapUsed: `${(health.metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(health.metrics.memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      },
      performance: {
        requestsPerSecond: health.metrics.requestsPerSecond.toFixed(2),
        averageResponseTime: `${health.metrics.averageResponseTime.toFixed(2)}ms`,
        errorRate: `${(health.metrics.errorRate * 100).toFixed(2)}%`,
        cacheHitRate: `${(health.metrics.cacheHitRate * 100).toFixed(2)}%`,
      },
      warnings: health.warnings,
    });
    return;
  }),
);

/**
 * GET /api/metrics
 * Get detailed system metrics
 *
 * Operation: getSystemMetrics
 */
router.get(
  '/metrics',
  asyncHandler(async (req: Request, res: Response) => {
    const metrics = await monitoring.getSystemMetrics();
    const history = monitoring.getMetricsHistory();

    res.json({
      timestamp: new Date().toISOString(),
      current: {
        uptime: metrics.uptime,
        memoryUsage: metrics.memoryUsage,
        cpuUsage: metrics.cpuUsage,
        requestsPerSecond: metrics.requestsPerSecond,
        averageResponseTime: metrics.averageResponseTime,
        errorRate: metrics.errorRate,
        cacheHitRate: metrics.cacheHitRate,
      },
      history: history.slice(-60), // Last 60 data points (1 hour)
    });
    return;
  }),
);

/**
 * POST /api/metrics/reset
 * Reset metrics (admin only)
 *
 * Operation: resetMetrics
 */
router.post(
  '/metrics/reset',
  asyncHandler(async (req: Request, res: Response) => {
    // Check for admin token (implement based on your auth system)
    const token = req.get('X-Admin-Token');
    if (token !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    monitoring.resetMetrics();

    res.json({
      message: 'Metrics reset successfully',
      timestamp: new Date().toISOString(),
    });
    return;
  }),
);

export default router;
