/**
 * VehicleController - Single Responsibility: Individual vehicle operations
 * Handles fetching vehicle details by lot number with caching
 */

import { Request, Response } from 'express';
import { VehicleRepository } from '../../services/repositories/vehicle.repository';
import { platformFactory } from '../../services/scrapers/platforms/platform.factory';
import { Logger } from '../../config/logger';

const logger = Logger.getInstance();

export class VehicleController {
  /**
   * GET /api/vehicle/:lotNumber
   * Get vehicle basic info from Firestore cache
   */
  async getVehicle(req: Request, res: Response): Promise<void> {
    const { lotNumber } = req.params;

    logger.info(`📦 Fetching vehicle: ${lotNumber}`);

    try {
      const vehicle = await VehicleRepository.getVehicleByLot(lotNumber);

      if (!vehicle) {
        res.status(404).json({
          success: false,
          error: 'Vehicle not found',
          lotNumber,
          message: 'Vehicle not found in cache. Try searching first or use /details endpoint.',
        });
        return;
      }

      res.json({
        success: true,
        vehicle,
        source: 'firestore',
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      logger.error(`Error fetching vehicle ${lotNumber}:`, error as Error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch vehicle',
        message: (error as Error).message,
      });
    }
  }

  /**
   * GET /api/vehicle/:lotNumber/details
   * Fetch extended details from Copart with full gallery and VIN
   */
  async getVehicleDetails(req: Request, res: Response): Promise<void> {
    const { lotNumber } = req.params;
    const { force_fresh } = req.query;

    logger.info(`🔍 Fetching extended details for vehicle: ${lotNumber}`);

    try {
      // Check cache first (unless force_fresh)
      if (!force_fresh) {
        const cachedVehicle = await VehicleRepository.getVehicleByLot(lotNumber);

        if (
          cachedVehicle &&
          cachedVehicle.images_gallery &&
          cachedVehicle.images_gallery.length > 1
        ) {
          logger.info(`✅ Extended data found in cache for ${lotNumber}`);
          res.json({
            success: true,
            vehicle: cachedVehicle,
            source: 'firestore',
            cached: true,
            timestamp: new Date().toISOString(),
          });
          return;
        }
      }

      // Scrape fresh data from Copart
      logger.info(`🌐 Scraping extended details from Copart for ${lotNumber}...`);

      const scrapeStartTime = Date.now();
      const platform = platformFactory.createScraper('copart');
      const copartUrl = `https://www.copart.com/lot/${lotNumber}`;

      const vehicles = await platform.scrape(copartUrl, 1, undefined, 1, 1);
      const scrapeDuration = Math.round((Date.now() - scrapeStartTime) / 1000);

      if (!vehicles || vehicles.length === 0) {
        logger.warn(`No vehicle data found for lot ${lotNumber}`);
        res.status(404).json({
          success: false,
          error: 'Vehicle not found on Copart',
          lotNumber,
          scrapeDurationSeconds: scrapeDuration,
          timestamp: new Date().toISOString(),
        });
        return;
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
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const scrapeStartTime = Date.now();
      const scrapeDuration = Math.round((Date.now() - scrapeStartTime) / 1000);
      logger.error(`Failed to scrape vehicle ${lotNumber}:`, error as Error);

      // Try to return cached basic data if available
      try {
        const cachedVehicle = await VehicleRepository.getVehicleByLot(lotNumber);
        if (cachedVehicle) {
          res.json({
            success: true,
            vehicle: cachedVehicle,
            source: 'firestore',
            cached: true,
            warning: 'Failed to fetch fresh data from Copart, returning cached version',
            scrapeDurationSeconds: scrapeDuration,
            timestamp: new Date().toISOString(),
          });
          return;
        }
      } catch (cacheError) {
        logger.error('Cache fallback also failed:', cacheError);
      }

      res.status(500).json({
        success: false,
        error: 'Failed to fetch vehicle details',
        message: (error as Error).message,
      });
    }
  }
}
