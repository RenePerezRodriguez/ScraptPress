import { Router, Request, Response } from 'express';

import { Logger } from '../../config/logger';
import { authenticateApiKey } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { requestIdMiddleware } from '../middleware/requestId';
import { SearchController } from '../controllers/search.controller';

const router = Router();
const logger = Logger.getInstance();
const searchController = new SearchController();

// Apply request ID middleware to all routes
router.use(requestIdMiddleware);

/**
 * GET /api/search/vehicles
 * Sistema de búsqueda de vehículos con cache dinámico, cola asíncrona y prefetch
 *
 * Operation: searchVehicles
 *
 * Modes:
 * - async=false (default): Synchronous scraping, waits for result
 * - async=true: Queues job, returns batchId immediately
 *
 * Security:
 * - Rate limiting per IP/API key
 * - Request ID tracking
 * - XSS/SQL injection detection
 * - Query validation and sanitization
 * - Max concurrent jobs per user
 * - Priority management (premium API keys get high priority)
 */
router.get('/vehicles', authenticateApiKey, rateLimiter(), async (req: Request, res: Response) => {
  try {
    logger.info('SEARCH', `Vehicles endpoint called [RequestID: ${req.id}]`);
    const { query, page = '1', limit = '10', async = 'false' } = req.query;

    // Strict validation
    if (!query || typeof query !== 'string') {
      logger.warn('VALIDATION', 'Missing or invalid query parameter', { requestId: req.id });
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required and must be a string',
        code: 'VALIDATION_ERROR',
      });
    }

    // Check length before processing
    if (query.length > 200) {
      logger.warn('VALIDATION', 'Query too long', {
        requestId: req.id,
        length: query.length,
      });
      return res.status(400).json({
        success: false,
        error: 'Query too long (max 200 characters)',
        code: 'VALIDATION_ERROR',
      });
    }

    if (query.length < 2) {
      logger.warn('VALIDATION', 'Query too short', { requestId: req.id });
      return res.status(400).json({
        success: false,
        error: 'Query too short (min 2 characters)',
        code: 'VALIDATION_ERROR',
      });
    }

    // Security checks - import from validation.ts
    const { containsXSS, containsSQLInjection, containsPathTraversal, sanitizeQuery } =
      await import('../middleware/validation');

    if (containsXSS(query)) {
      logger.warn('SECURITY', 'XSS attempt detected', {
        requestId: req.id,
        ip: req.ip,
        query,
      });
      return res.status(400).json({
        success: false,
        error: 'Invalid query: potentially malicious content detected',
        code: 'SECURITY_XSS_DETECTED',
      });
    }

    if (containsSQLInjection(query)) {
      logger.warn('SECURITY', 'SQL injection attempt detected', {
        requestId: req.id,
        ip: req.ip,
        query,
      });
      return res.status(400).json({
        success: false,
        error: 'Invalid query: potentially malicious content detected',
        code: 'SECURITY_SQL_INJECTION_DETECTED',
      });
    }

    if (containsPathTraversal(query)) {
      logger.warn('SECURITY', 'Path traversal attempt detected', {
        requestId: req.id,
        ip: req.ip,
        query,
      });
      return res.status(400).json({
        success: false,
        error: 'Invalid query: potentially malicious content detected',
        code: 'SECURITY_PATH_TRAVERSAL_DETECTED',
      });
    }

    // Sanitize query
    const sanitizedQuery = sanitizeQuery(query);

    // Validate pagination
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    if (isNaN(pageNum) || pageNum < 1 || pageNum > 1000) {
      logger.warn('VALIDATION', 'Invalid page parameter', {
        requestId: req.id,
        page,
      });
      return res.status(400).json({
        success: false,
        error: 'Invalid page parameter (must be 1-1000)',
        code: 'VALIDATION_ERROR',
      });
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      logger.warn('VALIDATION', 'Invalid limit parameter', {
        requestId: req.id,
        limit,
      });
      return res.status(400).json({
        success: false,
        error: 'Invalid limit parameter (must be 1-100)',
        code: 'VALIDATION_ERROR',
      });
    }

    const useAsync = async === 'true';

    // Get client info for security checks
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const apiKey = req.headers['x-api-key'] as string | undefined;

    logger.info('SEARCH', 'Query validated and sanitized', {
      requestId: req.id,
      original: query,
      sanitized: sanitizedQuery,
      page: pageNum,
      limit: limitNum,
      async: useAsync,
    });

    // Use SearchController with security
    const result = await searchController.intelligentSearch({
      query: sanitizedQuery,
      page: pageNum,
      limit: limitNum,
      clientIp,
      apiKey,
      async: useAsync,
    });

    // Add request ID to response
    return res.json({
      ...result,
      requestId: req.id,
    });
  } catch (error: unknown) {
    logger.error('SEARCH', 'Intelligent search error', {
      requestId: req.id,
      error: (error as Error).message,
      stack: (error as Error).stack,
    });

    return res.status(500).json({
      success: false,
      error: (error as Error).message || 'Search failed',
      requestId: req.id,
      code: 'INTERNAL_ERROR',
    });
  }
});

// TEST endpoint removed in production - use /vehicles with debug=true if needed in dev

/**
 * GET /api/search/stats
 * Get scraping statistics
 *
 * Operation: getSearchStats
 */
router.get('/stats', authenticateApiKey, async (_req: Request, res: Response) => {
  try {
    const result = await searchController.getStats();
    return res.json(result);
  } catch (error: unknown) {
    logger.error('Stats error:', error as Error);

    return res.status(500).json({
      success: false,
      error: 'Failed to get stats',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/search/status/:batchId
 * Get status of async scraping job
 *
 * Operation: getJobStatus
 *
 * Response:
 * - status: queued | processing | completed | failed
 * - If completed: includes vehicles array
 */
router.get('/status/:batchId', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;

    if (!batchId) {
      return res.status(400).json({
        success: false,
        error: 'batchId parameter is required',
      });
    }

    logger.info(`📊 Checking status for batch: ${batchId}`);

    const result = await searchController.getJobStatus(batchId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    return res.json(result);
  } catch (error: unknown) {
    logger.error(`Status check error for ${req.params.batchId}:`, error as Error);

    return res.status(500).json({
      success: false,
      error: 'Failed to get job status',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/search/popular
 * Get popular searches
 *
 * Operation: getPopularSearches
 */
router.get('/popular', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const { limit = '10' } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10) || 10, 50);

    const searches = await searchController.getPopular(limitNum);

    return res.json({
      success: true,
      searches,
      count: searches.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    logger.error('Popular searches error:', error as Error);

    return res.status(500).json({
      success: false,
      error: 'Failed to get popular searches',
      message: (error as Error).message,
    });
  }
});

export default router;
