import { Router, Request, Response } from 'express';
import { VehicleRepository } from '../../services/repositories/vehicle.repository';
import { Logger } from '../../config/logger';
import { authenticateApiKey } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { platformFactory } from '../../services/scrapers/platforms/platform.factory';

const router = Router();
const logger = Logger.getInstance();

/**
 * GET /api/search/cached
 * Search vehicles from Firestore (cached/stored results)
 * Fast response for previously scraped vehicles
 */
router.get('/cached', authenticateApiKey, rateLimiter(), async (req: Request, res: Response) => {
  try {
    logger.info('🎯 Cached endpoint called');
    const { query, page = '1', limit = '9' } = req.query;
    logger.info(`Query params: query="${query}", page=${page}, limit=${limit}`);

    if (!query || typeof query !== 'string') {
      logger.warn('Missing or invalid query parameter');
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required'
      });
    }

    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 9;
    logger.info(`Parsed: pageNum=${pageNum}, limitNum=${limitNum}`);

    // Search in Firestore
    logger.info('Calling VehicleRepository.searchVehicles...');
    const vehicles = await VehicleRepository.searchVehicles(query, limitNum, pageNum);
    logger.info(`searchVehicles returned ${vehicles.length} vehicles`);
    
    // Optimization: Only count if we need pagination info
    // For first page with full results, we can estimate
    let totalCount = vehicles.length;
    let totalPages = 1;
    
    if (vehicles.length === limitNum || pageNum > 1) {
      // Need accurate count for pagination
      logger.info('Calling VehicleRepository.countVehicles...');
      totalCount = await VehicleRepository.countVehicles(query);
      logger.info(`countVehicles returned ${totalCount}`);
      totalPages = Math.ceil(totalCount / limitNum);
    }

    logger.debug(`Cached search: "${query}" page ${pageNum} - Found ${vehicles.length}/${totalCount} vehicles`);

    res.json({
      success: true,
      source: 'firestore',
      cached: true,
      query,
      page: pageNum,
      limit: limitNum,
      returned: vehicles.length,
      total: totalCount,
      totalPages,
      hasMore: pageNum < totalPages,
      vehicles,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Cached search error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/search/hybrid
 * Hybrid search: Try cache first, fallback to fresh scraping if not found
 * Returns cached results instantly or scrapes Copart if needed
 */
router.get('/hybrid', authenticateApiKey, rateLimiter(), async (req: Request, res: Response) => {
  try {
    logger.info('🔄 Hybrid endpoint called');
    const { query, page = '1', limit = '9', force_fresh = 'false', max_age_hours = '24' } = req.query;
    logger.info(`Query params: query="${query}", page=${page}, limit=${limit}, force_fresh=${force_fresh}`);

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required'
      });
    }

    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 9;
    const forceFresh = force_fresh === 'true';
    const maxAgeHours = parseInt(max_age_hours as string, 10) || 24;

    // Step 1: Try cache first (unless force_fresh)
    let vehicles: any[] = [];
    let totalCount = 0;
    let source = 'firestore';
    let cached = true;
    
    if (!forceFresh) {
      logger.info('Checking Firestore cache...');
      vehicles = await VehicleRepository.searchVehicles(query, limitNum, pageNum);
      
      if (vehicles.length > 0) {
        logger.info(`✅ Found ${vehicles.length} vehicles in cache`);
        
        // Cache is good enough - return it
        // (cache age checking can be added later if needed)
        totalCount = await VehicleRepository.countVehicles(query);
        const totalPages = Math.ceil(totalCount / limitNum);
        
        return res.json({
          success: true,
          source: 'firestore',
          cached: true,
          fresh: false,
          query,
          page: pageNum,
          limit: limitNum,
          returned: vehicles.length,
          total: totalCount,
          totalPages,
          hasMore: pageNum < totalPages,
          vehicles,
          timestamp: new Date().toISOString()
        });
      } else {
        logger.info('No vehicles found in cache, will scrape Copart');
      }
    }

    // Step 2: Cache miss or insufficient cache - Scrape from Copart
    // Smart pagination: Copart gives 20 results/page, we can show any amount
    logger.info('🌐 Need to scrape from Copart...');
    source = 'copart';
    cached = false;
    
    // Calculate total vehicles needed for this page
    const vehiclesNeeded = pageNum * limitNum;
    logger.info(`Need ${vehiclesNeeded} vehicles total (page ${pageNum} × ${limitNum} per page)`);
    
    // Copart returns 20 vehicles per page
    // Calculate how many Copart pages we need
    const COPART_PAGE_SIZE = 20;
    const copartPagesNeeded = Math.ceil(vehiclesNeeded / COPART_PAGE_SIZE);
    
    // Estimate time: ~60-90 seconds per Copart page
    const estimatedSeconds = copartPagesNeeded * 75; // Average 75 seconds per page
    const estimatedMinutes = Math.round(estimatedSeconds / 60 * 10) / 10;
    
    logger.info(`Will scrape ${copartPagesNeeded} Copart page(s) (20 vehicles each)`);
    logger.info(`Estimated time: ${estimatedMinutes} minutes (~${estimatedSeconds} seconds)`);
    
    // Use existing scraper logic
    const platform = platformFactory.createScraper('copart');
    
    // Build Copart search URL
    const copartUrl = `https://www.copart.com/lotSearchResults/?free=true&query=${encodeURIComponent(query)}`;
    
    try {
      const scrapeStartTime = Date.now();
      let allVehicles: any[] = [];
      
      // Scrape each Copart page
      for (let copartPage = 1; copartPage <= copartPagesNeeded; copartPage++) {
        logger.info(`Scraping Copart page ${copartPage}/${copartPagesNeeded}...`);
        
        const batchVehicles = await platform.scrape(
          copartUrl,
          20, // Copart's page size
          undefined,
          copartPage,
          20
        );
        
        if (batchVehicles && batchVehicles.length > 0) {
          allVehicles = [...allVehicles, ...batchVehicles];
          logger.info(`Got ${batchVehicles.length} vehicles from Copart page ${copartPage}, total: ${allVehicles.length}`);
        } else {
          logger.warn(`Copart page ${copartPage} returned no vehicles, stopping`);
          break;
        }
      }
      
      const scrapeDuration = Math.round((Date.now() - scrapeStartTime) / 1000); // seconds
      logger.info(`Scraping took ${scrapeDuration} seconds (${Math.round(scrapeDuration / 60 * 10) / 10} minutes)`);
      
      if (!allVehicles || allVehicles.length === 0) {
        return res.json({
          success: true,
          source: 'copart',
          cached: false,
          fresh: true,
          query,
          page: pageNum,
          limit: limitNum,
          returned: 0,
          total: 0,
          totalPages: 0,
          hasMore: false,
          vehicles: [],
          message: 'No vehicles found for this query',
          timestamp: new Date().toISOString()
        });
      }

      logger.info(`Scraping complete: ${allVehicles.length} total vehicles retrieved`);

      // Save to Firestore in background (don't block response)
      logger.info(`Saving ${allVehicles.length} vehicles to Firestore...`);
      Promise.all(
        allVehicles.map((vehicle: any) => VehicleRepository.upsertVehicle(vehicle))
      ).then(() => {
        logger.info(`✅ All ${allVehicles.length} vehicles saved to Firestore`);
      }).catch(err => logger.error('Background save error:', err));

      // Paginate results for response
      const startIndex = (pageNum - 1) * limitNum;
      const endIndex = startIndex + limitNum;
      vehicles = allVehicles.slice(startIndex, endIndex);
      totalCount = allVehicles.length;
      const totalPages = Math.ceil(totalCount / limitNum);

      res.json({
        success: true,
        source: 'copart',
        cached: false,
        fresh: true,
        query,
        page: pageNum,
        limit: limitNum,
        returned: vehicles.length,
        total: totalCount,
        totalPages,
        hasMore: vehicles.length === limitNum, // If we got full page, there might be more
        vehicles,
        message: `Scraped ${copartPagesNeeded} Copart page(s) = ${allVehicles.length} vehicles in ${scrapeDuration}s. Now in cache.`,
        copartPagesScraped: copartPagesNeeded,
        scrapeDurationSeconds: scrapeDuration,
        timestamp: new Date().toISOString()
      });

    } catch (scrapingError) {
      logger.error('Copart scraping failed:', scrapingError);
      throw scrapingError;
    }

  } catch (error) {
    logger.error('Hybrid search error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/search/stats
 * Get search statistics (total vehicles, last update, etc.)
 */
router.get('/stats', authenticateApiKey, async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required'
      });
    }

    const totalCount = await VehicleRepository.countVehicles(query);
    
    res.json({
      success: true,
      query,
      totalVehicles: totalCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;
