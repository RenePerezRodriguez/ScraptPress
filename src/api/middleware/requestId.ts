/**
 * Request ID Middleware - Adds unique ID to each request
 * Used for distributed tracing and log correlation
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { Logger } from '../../config/logger';

const logger = Logger.getInstance();

/**
 * Middleware to generate and attach request ID
 * Also adds X-Request-ID header to response and sets it in logger context
 */
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Check if request already has ID (from load balancer)
  const existingId = req.get('X-Request-ID') || req.get('X-Correlation-ID');

  // Generate or use existing ID
  req.id = existingId || randomUUID();

  // Add to response headers
  res.setHeader('X-Request-ID', req.id);

  // Set in logger context for automatic inclusion in all logs
  logger.setRequestId(req.id);

  // Clear request ID when response finishes
  res.on('finish', () => {
    logger.clearRequestId();
  });

  next();
};
