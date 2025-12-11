import 'dotenv/config'; // Load environment variables first
import express from 'express';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import apiRoutes from './api/routes';
import { initializeRedis } from './api/middleware/rateLimiter';
import { apiVersionMiddleware } from './api/middleware/apiVersioning';
import { Logger } from './config/logger';
import { MonitoringService } from './services/infrastructure/monitoring.service';
import { CacheService } from './services/cache.service';
import { SentryService } from './config/sentry';
import { initializeFirebase } from './config/firebase';
import securityConfig from './config/security';
import GracefulShutdown from './services/infrastructure/graceful-shutdown.service';

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);
const logger = Logger.getInstance();
const monitoring = MonitoringService.getInstance();
const cache = CacheService.getInstance();
const gracefulShutdown = GracefulShutdown.getInstance();

// Validate security configuration
const securityValidation = securityConfig.validateEnvironment();
if (!securityValidation.valid && securityConfig.isProduction()) {
  logger.error(
    '🔐 SECURITY VALIDATION FAILED IN PRODUCTION - Missing:',
    securityValidation.missing,
  );
  logger.error(
    "Generate secure keys with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
  process.exit(1);
}

// Initialize Firebase Firestore (shared database with SUM-Trading)
try {
  initializeFirebase();
  logger.info('✅ Firebase initialized successfully');
} catch (error) {
  logger.warn('⚠️ Failed to initialize Firebase (running in limited mode):', error);
  logger.warn('⚠️ Application will continue without Firebase/Firestore functionality');
  // Do not exit - allow app to run without Firebase
}

// Initialize Sentry for error tracking (must be before other middleware)
SentryService.init(app);

// Initialize Redis for rate limiting
initializeRedis().catch((err) => {
  logger.warn('Redis initialization failed, will use memory fallback:', err);
});

// Initialize Cache Service
cache.connect().catch((err) => {
  logger.warn('Cache initialization failed, caching disabled:', err);
});

// Security middleware - Helmet
app.use(helmet(securityConfig.getHelmetConfig()));

// CORS configuration
const allowedOrigins = securityConfig.getAllowedOrigins();

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, Postman, curl)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Admin-Token'],
  }),
);

// Middleware to parse JSON bodies
app.use(express.json());

// Health check endpoint (for Cloud Run / load balancers)
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

// API versioning middleware
app.use('/api', apiVersionMiddleware);

// Request logging and monitoring middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    const success = res.statusCode < 400;
    monitoring.recordRequest(responseTime, success);
    logger.debug(`${req.method} ${req.path}`, {
      status: res.statusCode,
      responseTime: `${responseTime}ms`,
    });
  });
  next();
});

// Main API routes are prefixed with /api (BEFORE static files!)
app.use('/api', apiRoutes);

// Serve static files (HTML, CSS, JS) from the 'public' directory
// IMPORTANT: This MUST come AFTER API routes to avoid conflicts
app.use(express.static(path.join(process.cwd(), 'public')));

// Sentry error handler - must be after all routes
app.use(SentryService.errorHandler());

// Redirect all other GET requests to the frontend
// This ensures that our single-page application routing works
app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

const server = app.listen(port, '0.0.0.0', () => {
  logger.info(`🚀 Server started on port ${port}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`📋 API ready at /api`);

  // Register shutdown handlers
  gracefulShutdown.registerHandler(GracefulShutdown.createExpressHandler(server));
  gracefulShutdown.registerHandler(
    GracefulShutdown.createGenericHandler('Cache Service', async () => {
      await cache.disconnect();
    }),
  );
  gracefulShutdown.registerHandler(
    GracefulShutdown.createGenericHandler(
      'Monitoring',
      async () => {
        logger.info('SHUTDOWN', 'Final metrics', await monitoring.getHealthStatus());
      },
      2000,
    ),
  );

  logger.info('SHUTDOWN', 'Graceful shutdown handlers registered');
});

server.on('error', (err: unknown) => {
  logger.error('❌ Server startup error:', err as Error);
  if (err && typeof err === 'object' && (err as { code?: string }).code === 'EADDRINUSE') {
    logger.error(`Port ${port} is already in use. Please kill the process or change PORT in .env`);
  }
  process.exit(1);
});

// Start periodic metrics logging
setInterval(() => {
  monitoring.startPeriodicLogging();
}, 60000); // Every minute
