import 'dotenv/config'; // Load environment variables first
import express from 'express';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import apiRoutes from './api/routes';
import { initializeRedis } from './api/middleware/rateLimiter';
import { apiVersionMiddleware } from './api/middleware/apiVersioning';
import { Logger } from './config/logger';
import { MonitoringService } from './services/monitoring.service';
import { CacheService } from './services/cache.service';
import { SentryService } from './config/sentry';
import { initializeFirebase } from './config/firebase';

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);
const logger = Logger.getInstance();
const monitoring = MonitoringService.getInstance();
const cache = CacheService.getInstance();

// Initialize Firebase Firestore (shared database with SUM-Trading)
try {
  initializeFirebase();
} catch (error) {
  logger.error('Failed to initialize Firebase:', error);
  process.exit(1);
}

// Initialize Sentry for error tracking (must be before other middleware)
SentryService.init(app);

// Initialize Redis for rate limiting
initializeRedis().catch(err => {
  logger.warn('Redis initialization failed, will use memory fallback:', err);
});

// Initialize Cache Service
cache.connect().catch(err => {
  logger.warn('Cache initialization failed, caching disabled:', err);
});

// Security middleware - Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts for frontend
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Allow loading external resources
  })
);

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:5173'];

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
  })
);

// Middleware to parse JSON bodies
app.use(express.json());

// Health check endpoint (for Cloud Run / load balancers)
app.get('/health', (req, res) => {
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

// Serve static files (HTML, CSS, JS) from the 'public' directory
// Use process.cwd() for a more reliable path to the project root
app.use(express.static(path.join(process.cwd(), 'public')));

// Main API routes are prefixed with /api
app.use('/api', apiRoutes);

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
});

// Start periodic metrics logging
setInterval(() => {
  monitoring.startPeriodicLogging();
}, 60000); // Every minute

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
    logger.error('Unhandled Rejection at:', err);
    // Close server & exit process
    server.close(() => process.exit(1));
});
