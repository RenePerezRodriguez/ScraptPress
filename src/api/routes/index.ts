import { Router } from 'express';
import scraperRoutes from './scraper.routes';
import healthRoutes from './health.routes';
import gdprRoutes from './gdpr.routes';
import searchRoutes from './search.routes';
import vehicleRoutes from './vehicle.routes';
import firestoreLookupRoutes from './firestore-lookup.routes';

const router = Router();

// Health and monitoring routes
router.use('', healthRoutes);

// GDPR and Privacy routes
router.use('/gdpr', gdprRoutes);

// Search routes (cached and fresh)
router.use('/search', searchRoutes);

// Firestore batch lookup (for vehicle details page optimization)
router.use('/search/firestore-lookup', firestoreLookupRoutes);

// Individual vehicle routes
router.use('/vehicle', vehicleRoutes);

// All scraper-related routes will be under /scraper
// e.g., POST /api/scraper/scrape, GET /api/scraper/search
router.use('/scraper', scraperRoutes);

export default router;
