
import { Router } from 'express';
import ScraperController from '../controllers/scraper.controller';
import { rateLimiter, rateLimitPresets } from '../middleware/rateLimiter';
import { authenticateApiKey } from '../middleware/auth';
import { validateSearchRequest } from '../middleware/validation';

const router = Router();

// Apply different rate limits to different endpoints
// Scraping endpoints: strict (5 requests/minute) + authentication + validation
router.post(
  '/scrape',
  rateLimitPresets.scraping(),
  authenticateApiKey,
  validateSearchRequest,
  ScraperController.scrape
);
router.post(
  '/start',
  rateLimitPresets.scraping(),
  authenticateApiKey,
  validateSearchRequest,
  ScraperController.start
);

// Search endpoints: normal (100 requests/minute) + authentication + validation
router.get(
  '/search',
  rateLimitPresets.normal(),
  authenticateApiKey,
  validateSearchRequest,
  ScraperController.search
);
router.get('/events', rateLimitPresets.normal(), ScraperController.events);

// API endpoints: strict (30 requests/minute) + authentication + validation
router.post(
  '/vehicles',
  rateLimitPresets.strict(),
  authenticateApiKey,
  validateSearchRequest,
  ScraperController.api
);
router.get(
  '/vehicles/:lot',
  rateLimitPresets.strict(),
  authenticateApiKey,
  ScraperController.vehicleByLot
);

// Future route for getting specific lot details
// router.get('/lot/:lot_number', ...);

export default router;
