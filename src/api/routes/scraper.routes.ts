/**
 * Scraper Routes - Server-Sent Events for live scraping logs
 * Single Responsibility: Real-time event streaming
 *
 * DEPRECATED ENDPOINTS REMOVED:
 * - POST /scrape → Use GET /api/search/vehicles?async=true
 * - POST /start → Use GET /api/search/vehicles?async=true
 * - GET /search → Use GET /api/search/vehicles
 * - POST /vehicles → Use GET /api/search/vehicles
 * - GET /vehicles/:lot → Use GET /api/vehicle/:lotNumber/details
 */

import { Router } from 'express';
import ScraperController from '../controllers/scraper.controller';
import { rateLimitPresets } from '../middleware/rateLimiter';

const router = Router();

/**
 * GET /api/scraper/events
 * Server-Sent Events stream for real-time scraping logs
 * Used by frontend to display live progress
 *
 * Operation: streamScrapingEvents
 */
router.get('/events', rateLimitPresets.normal(), ScraperController.events);

export default router;
