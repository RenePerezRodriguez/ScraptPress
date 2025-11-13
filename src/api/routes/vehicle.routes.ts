/**
 * Vehicle Routes - Individual vehicle details
 */

import express from 'express';
import { authenticateApiKey } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { asyncHandler } from '../utils/asyncHandler';
import { VehicleRepository } from '../../services/repositories/vehicle.repository';
import { platformFactory } from '../../services/scrapers/platforms/platform.factory';
import { Logger } from '../../config/logger';

const router = express.Router();
const logger = Logger.getInstance();

/**
 * GET /api/vehicle/:lotNumber
 * Get vehicle basic info from cache (Firestore)
 */
router.get(
  '/:lotNumber',
  authenticateApiKey,
  rateLimiter(),
  asyncHandler(async (req, res) => {
    const { lotNumber } = req.params;
    
    logger.info(`📦 Fetching vehicle: ${lotNumber}`);
    
    const vehicle = await VehicleRepository.getVehicleByLot(lotNumber);
    
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found',
        lotNumber,
        message: 'Vehicle not found in cache. Try searching first or use /details endpoint.'
      });
    }
    
    res.json({
      success: true,
      vehicle,
      source: 'firestore',
      timestamp: new Date().toISOString()
    });
  })
);

/**
 * GET /api/vehicle/:lotNumber/details
 * Fetch extended details for a specific vehicle from Copart
 * This includes: full VIN, complete image gallery, highlights, engine video
 */
router.get(
  '/:lotNumber/details',
  authenticateApiKey,
  rateLimiter(),
  asyncHandler(async (req, res) => {
    const { lotNumber } = req.params;
    const { force_fresh } = req.query;
    
    logger.info(`🔍 Fetching extended details for vehicle: ${lotNumber}`);
    
    // Step 1: Check if we already have extended data in cache
    if (!force_fresh) {
      const cachedVehicle = await VehicleRepository.getVehicleByLot(lotNumber);
      
      if (cachedVehicle && cachedVehicle.images_gallery && cachedVehicle.images_gallery.length > 1) {
        logger.info(`✅ Extended data found in cache for ${lotNumber}`);
        return res.json({
          success: true,
          vehicle: cachedVehicle,
          source: 'firestore',
          cached: true,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Step 2: Scrape extended data from Copart
    logger.info(`🌐 Scraping extended details from Copart for ${lotNumber}...`);
    
    const scrapeStartTime = Date.now();
    const platform = platformFactory.createScraper('copart');
    
    try {
      // Use the lot URL format for single vehicle scraping
      const copartUrl = `https://www.copart.com/lot/${lotNumber}`;
      
      const vehicles = await platform.scrape(
        copartUrl,
        1, // Only fetch this one vehicle with full details
        undefined,
        1,
        1
      );
      
      const scrapeDuration = Math.round((Date.now() - scrapeStartTime) / 1000);
      
      if (!vehicles || vehicles.length === 0) {
        logger.warn(`No vehicle data found for lot ${lotNumber}`);
        return res.status(404).json({
          success: false,
          error: 'Vehicle not found on Copart',
          lotNumber,
          scrapeDurationSeconds: scrapeDuration,
          timestamp: new Date().toISOString()
        });
      }
      
      const vehicle = vehicles[0];
      
      // Save to Firestore for future requests
      logger.info(`💾 Saving extended data for ${lotNumber} to Firestore...`);
      await VehicleRepository.upsertVehicle(vehicle);
      
      logger.info(`✅ Extended details scraped in ${scrapeDuration}s for ${lotNumber}`);
      
      res.json({
        success: true,
        vehicle,
        source: 'copart',
        cached: false,
        scrapeDurationSeconds: scrapeDuration,
        message: `Extended details scraped from Copart in ${scrapeDuration}s`,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      const scrapeDuration = Math.round((Date.now() - scrapeStartTime) / 1000);
      logger.error(`Failed to scrape vehicle ${lotNumber}:`, error);
      
      // Try to return cached basic data if available
      const cachedVehicle = await VehicleRepository.getVehicleByLot(lotNumber);
      if (cachedVehicle) {
        return res.json({
          success: true,
          vehicle: cachedVehicle,
          source: 'firestore',
          cached: true,
          warning: 'Failed to fetch fresh data from Copart, returning cached version',
          scrapeDurationSeconds: scrapeDuration,
          timestamp: new Date().toISOString()
        });
      }
      
      throw error;
    }
  })
);

export default router;
