import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';
import { Logger } from '../../config/logger';

const logger = Logger.getInstance();

/**
 * Schema for search/scraping requests
 * Enhanced with strict security validation
 */
export const SearchRequestSchema = z.object({
  query: z
    .string()
    .min(2, 'Query must be at least 2 characters')
    .max(200, 'Query too long (max 200 characters)')
    .regex(/^[a-zA-Z0-9\s\-_.]+$/, 'Query contains invalid characters')
    .refine((val) => !containsXSS(val), {
      message: 'Query contains potentially malicious XSS content',
    })
    .refine((val) => !containsSQLInjection(val), {
      message: 'Query contains potentially malicious SQL content',
    })
    .refine((val) => !containsPathTraversal(val), {
      message: 'Query contains potentially malicious path content',
    }),

  count: z
    .number()
    .int('Count must be an integer')
    .min(1, 'Count must be at least 1')
    .max(50, 'Count cannot exceed 50')
    .optional()
    .default(15),

  page: z
    .number()
    .int('Page must be an integer')
    .min(1, 'Page must be at least 1')
    .max(1000, 'Page cannot exceed 1000')
    .optional()
    .default(1),
});

/**
 * Schema for lot number validation
 */
export const LotNumberSchema = z.object({
  lot: z.string().regex(/^\d{8,10}$/, 'Invalid lot number format (must be 8-10 digits)'),
});

/**
 * Schema for GDPR requests
 */
export const GDPREmailSchema = z.object({
  email: z.string().email('Invalid email address').max(255, 'Email too long'),

  reason: z.string().max(500, 'Reason too long').optional(),
});

/**
 * Generic validation middleware factory
 *
 * @param schema - Zod schema to validate against
 * @param source - Where to find data ('body', 'query', 'params')
 *
 * @example
 * router.post('/search', validate(SearchRequestSchema, 'body'), controller.search);
 */
export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Get data from specified source
      const data = req[source];

      // Parse and validate
      const validated = schema.parse(data);

      // Replace original data with validated data
      req[source] = validated;

      logger.debug('Validation successful', {
        path: req.path,
        source,
      });

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn('Validation failed', {
          path: req.path,
          errors: error.errors,
          data: req[source],
        });

        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
        return;
      }

      // Unexpected error
      logger.error('Validation middleware error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  };
}

/**
 * Safe parse - validates but doesn't throw, returns result
 * Useful for optional validation or gradual migration
 */
export function safeParse<T>(
  schema: ZodSchema<T>,
  data: unknown,
): {
  success: boolean;
  data?: T;
  error?: ZodError;
} {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, error: result.error };
}

/**
 * XSS Attack Patterns - Detects common XSS injection attempts
 */
const XSS_PATTERNS = [
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  /<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi,
  /javascript:/gi,
  /onerror\s*=/gi,
  /onload\s*=/gi,
  /onclick\s*=/gi,
  /<img[\s\S]*?src[\s\S]*?>/gi,
  /eval\(/gi,
  /expression\(/gi,
  /<object[\s\S]*?>/gi,
  /<embed[\s\S]*?>/gi,
];

/**
 * SQL Injection Patterns - Detects common SQL injection attempts
 */
const SQL_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
  /(UNION\s+SELECT)/gi,
  /('|"|`|;|\-\-|\/\*|\*\/|xp_)/gi,
  /(OR\s+1\s*=\s*1)/gi,
  /(AND\s+1\s*=\s*1)/gi,
];

/**
 * Path Traversal Patterns - Detects directory traversal attempts
 */
const PATH_TRAVERSAL_PATTERNS = [/\.\./g, /\.\\/g, /\.\.%2[fF]/g, /%2e%2e/gi];

/**
 * Check if string contains XSS attack patterns
 */
export function containsXSS(input: string): boolean {
  return XSS_PATTERNS.some((pattern) => pattern.test(input));
}

/**
 * Check if string contains SQL injection patterns
 */
export function containsSQLInjection(input: string): boolean {
  return SQL_PATTERNS.some((pattern) => pattern.test(input));
}

/**
 * Check if string contains path traversal patterns
 */
export function containsPathTraversal(input: string): boolean {
  return PATH_TRAVERSAL_PATTERNS.some((pattern) => pattern.test(input));
}

/**
 * Sanitize query string - removes potentially dangerous characters
 * Now with enhanced security detection
 */
export function sanitizeQuery(query: string): string {
  // Check for attack patterns BEFORE sanitization
  if (containsXSS(query)) {
    logger.warn('SECURITY', 'XSS attempt detected', { query });
    throw new Error('Invalid query: potentially malicious XSS content detected');
  }

  if (containsSQLInjection(query)) {
    logger.warn('SECURITY', 'SQL injection attempt detected', { query });
    throw new Error('Invalid query: potentially malicious SQL content detected');
  }

  if (containsPathTraversal(query)) {
    logger.warn('SECURITY', 'Path traversal attempt detected', { query });
    throw new Error('Invalid query: potentially malicious path detected');
  }

  return query
    .replace(/[<>\"']/g, '') // Remove HTML/script characters
    .replace(/[;$`|&]/g, '') // Remove shell metacharacters
    .trim()
    .slice(0, 100); // Limit length
}

/**
 * Validate and sanitize middleware for search requests
 * Combines validation with sanitization
 */
export const validateSearchRequest = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Parse numbers from query params if they come as strings
    const data = {
      query: req.body.query,
      count: req.body.count ? parseInt(String(req.body.count), 10) : undefined,
      page: req.body.page ? parseInt(String(req.body.page), 10) : undefined,
    };

    // Validate with schema
    const validated = SearchRequestSchema.parse(data);

    // Additional sanitization
    validated.query = sanitizeQuery(validated.query);

    // Replace body with validated and sanitized data
    req.body = validated;

    logger.debug('Search request validated', {
      query: validated.query,
      count: validated.count,
      page: validated.page,
    });

    next();
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: 'Invalid request parameters',
        details: error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        })),
      });
      return;
    }

    logger.error('Validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

/**
 * Validate GDPR email requests
 * Ensures email format is valid for GDPR operations
 */
export const validateGdprEmail = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const validated = GDPREmailSchema.parse(req.body);
    req.body = validated;
    next();
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: 'Invalid email format',
        details: error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        })),
      });
      return;
    }

    logger.error('GDPR validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};
