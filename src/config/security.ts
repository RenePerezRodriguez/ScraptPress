/**
 * Security Configuration
 * Centralized security settings and validation
 */

import { Logger } from './logger';

const logger = Logger.getInstance();

export class SecurityConfig {
  private static instance: SecurityConfig;

  private constructor() {}

  static getInstance(): SecurityConfig {
    if (!SecurityConfig.instance) {
      SecurityConfig.instance = new SecurityConfig();
    }
    return SecurityConfig.instance;
  }

  /**
   * Validate required environment variables
   */
  validateEnvironment(): { valid: boolean; missing: string[] } {
    const required = ['API_KEY', 'ADMIN_TOKEN'];
    const missing: string[] = [];

    for (const key of required) {
      if (
        !process.env[key] ||
        process.env[key] === 'your-secure-api-key-here-generate-new-one' ||
        process.env[key] === 'your-secure-admin-token-here-generate-new-one'
      ) {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      logger.error('🔐 Security validation failed - missing or default values:', missing);
      return { valid: false, missing };
    }

    logger.info('✅ Security environment validated');
    return { valid: true, missing: [] };
  }

  /**
   * Validate API key format (should be 32+ hex characters)
   */
  isValidApiKeyFormat(key: string): boolean {
    return /^[a-f0-9]{32,}$/i.test(key);
  }

  /**
   * Check if running in production
   */
  isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  /**
   * Get sanitized environment info for logging
   */
  getSanitizedEnv() {
    return {
      NODE_ENV: process.env.NODE_ENV || 'development',
      PORT: process.env.PORT || '3000',
      REDIS_CONFIGURED: !!process.env.REDIS_HOST,
      SENTRY_CONFIGURED: !!process.env.SENTRY_DSN,
      FIREBASE_CONFIGURED: !!(
        process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      ),
      GEMINI_CONFIGURED: !!process.env.GEMINI_API_KEY,
      AI_ENABLED: process.env.ENABLE_AI_EXTRACTION === 'true',
    };
  }

  /**
   * Rate limit thresholds by environment
   */
  getRateLimitConfig() {
    const isDev = !this.isProduction();

    return {
      general: {
        windowMs: 60000, // 1 minute
        maxRequests: isDev ? 100 : 60,
      },
      scraping: {
        windowMs: 60000,
        maxRequests: isDev ? 10 : 5,
      },
      admin: {
        windowMs: 60000,
        maxRequests: isDev ? 50 : 10,
      },
    };
  }

  /**
   * CORS whitelist
   */
  getAllowedOrigins(): string[] {
    const defaultOrigins = ['http://localhost:3000', 'http://localhost:5173'];

    if (process.env.ALLOWED_ORIGINS) {
      return process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim());
    }

    return defaultOrigins;
  }

  /**
   * Helmet security headers configuration
   */
  getHelmetConfig() {
    return {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://cdn.tailwindcss.com',
            'https://cdnjs.cloudflare.com',
          ],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            'https://cdn.tailwindcss.com',
            'https://cdnjs.cloudflare.com',
          ],
          scriptSrcAttr: ["'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'http://localhost:3000', 'http://localhost:3001'],
        },
      },
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
    };
  }
}

export default SecurityConfig.getInstance();
