import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Logger } from '../../config/logger';

const logger = Logger.getInstance();

/**
 * Secure string comparison to prevent timing attacks
 */
function secureCompare(a: string, b: string): boolean {
  try {
    // Convert strings to buffers
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');

    // If lengths differ, return false
    if (bufA.length !== bufB.length) {
      return false;
    }

    // Use timingSafeEqual with proper typing
    return crypto.timingSafeEqual(new Uint8Array(bufA), new Uint8Array(bufB));
  } catch (error) {
    logger.error('Error in secure comparison:', error);
    return false;
  }
}

/**
 * Middleware to authenticate API requests using API Key
 *
 * Usage:
 * - Set API_KEY environment variable
 * - Send requests with 'X-API-Key' header
 *
 * @example
 * router.post('/scrape', authenticateApiKey, controller.scrape);
 */
export const authenticateApiKey = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.get('X-API-Key') || req.get('Authorization')?.replace('Bearer ', '');
  const validKey = process.env.API_KEY;

  // If API_KEY is not configured, allow requests (dev mode)
  if (!validKey) {
    logger.warn('⚠️ API_KEY not configured - authentication disabled');
    return next();
  }

  // Check if API key is provided
  if (!apiKey) {
    logger.warn('Authentication failed: No API key provided', {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });

    res.status(401).json({
      success: false,
      error: 'Authentication required',
      message: 'Please provide a valid API key in X-API-Key header',
    });
    return;
  }

  // Validate API key using secure comparison
  if (!secureCompare(apiKey, validKey)) {
    logger.warn('Authentication failed: Invalid API key', {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });

    res.status(401).json({
      success: false,
      error: 'Invalid API key',
      message: 'The provided API key is not valid',
    });
    return;
  }

  // Authentication successful
  logger.debug('Authentication successful', {
    ip: req.ip,
    path: req.path,
  });

  next();
};

/**
 * Optional authentication - allows requests without API key but logs a warning
 * Useful for gradual migration to authenticated endpoints
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.get('X-API-Key') || req.get('Authorization')?.replace('Bearer ', '');
  const validKey = process.env.API_KEY;

  if (!validKey || !apiKey) {
    logger.debug('Request without authentication', {
      ip: req.ip,
      path: req.path,
    });
    return next();
  }

  if (secureCompare(apiKey, validKey)) {
    logger.debug('Authenticated request', { ip: req.ip });
  } else {
    logger.warn('Invalid API key provided', { ip: req.ip });
  }

  next();
};

/**
 * Admin authentication - requires ADMIN_TOKEN
 * Use for sensitive operations like metrics reset
 */
export const authenticateAdmin = (req: Request, res: Response, next: NextFunction): void => {
  const token = req.get('X-Admin-Token');
  const validToken = process.env.ADMIN_TOKEN;

  if (!validToken) {
    logger.error('ADMIN_TOKEN not configured');
    res.status(500).json({
      success: false,
      error: 'Server configuration error',
    });
    return;
  }

  if (!token || !secureCompare(token, validToken)) {
    logger.warn('Admin authentication failed', {
      ip: req.ip,
      path: req.path,
    });

    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Admin access required',
    });
    return;
  }

  logger.info('AUTH', 'Admin access granted', {
    ip: req.ip,
    path: req.path,
  });

  next();
};
