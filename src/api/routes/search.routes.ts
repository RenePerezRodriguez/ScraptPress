import { Router, Request, Response } from 'express';
import { VehicleRepository } from '../../services/repositories/vehicle.repository';
import { BatchRepository } from '../../services/repositories/batch.repository';
import { Logger } from '../../config/logger';
import { authenticateApiKey } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { platformFactory } from '../../services/scrapers/platforms/platform.factory';
import { CopartConfig } from '../../config/copart.config';
import { CacheService } from '../../services/cache.service';
import { backgroundScraperService } from '../../services/background-scraper.service';
import { scrapingLockService } from '../../services/scraping-lock.service';

const router = Router();
const logger = Logger.getInstance();
const cache = CacheService.getInstance();

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
 * Hybrid search with intelligent batching for optimal pagination
 * 
 * Strategy:
 * - Frontend pagination: 10 items per page (configurable via limit)
 * - Backend batching: 50 items per request (optimal caching)
 * - Example: Pages 1-5 served from first batch (items 1-50)
 *            Pages 6-10 served from second batch (items 51-100)
 * 
 * Flow:
 * 1. Calculate which backend batch is needed for requested page
 * 2. Check cache for that batch
 * 3. If cached: slice and return requested page
 * 4. If not cached: scrape full batch, cache it, return requested page
 * 5. Suggest prefetch for next batch when approaching end
 */
router.get('/hybrid', authenticateApiKey, rateLimiter(), async (req: Request, res: Response) => {
  try {
    logger.info('🔄 Hybrid endpoint called');
    const { 
      query, 
      page = '1', 
      limit = '10', // Frontend page size (default 10 for your strategy)
      force_fresh = 'false', 
      max_age_hours = '24',
      page_size // Optional: override backend batch size (default 50)
    } = req.query;
    logger.info(`Query params: query="${query}", page=${page}, limit=${limit}, force_fresh=${force_fresh}`);

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required',
        example: '/api/search/hybrid?query=toyota&page=1&limit=10'
      });
    }

    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 10;
    const forceFresh = force_fresh === 'true';
    const maxAgeHours = parseInt(max_age_hours as string, 10) || 24;
    
    // Calculate batching strategy
    const frontendPageSize = limitNum;
    const backendBatchSize = page_size 
      ? parseInt(page_size as string, 10) 
      : CopartConfig.pagination.backendBatchSize; // Default: 50
    
    const itemOffset = (pageNum - 1) * frontendPageSize;
    const batchNumber = Math.floor(itemOffset / backendBatchSize);
    const batchStartItem = batchNumber * backendBatchSize;
    const offsetInBatch = itemOffset - batchStartItem;
    
    logger.info(`📊 Batching: page=${pageNum}, batch=${batchNumber}, offset=${offsetInBatch}, batchSize=${backendBatchSize}`);
    
    // Step 1: Try Redis cache for this batch
    const cacheKey = `search:${query}:batch:${batchNumber}:size:${backendBatchSize}`;
    
    if (!forceFresh) {
      const cached = await cache.get<any>(cacheKey);
      if (cached?.vehicles && Array.isArray(cached.vehicles)) {
        const paginatedVehicles = cached.vehicles.slice(
          offsetInBatch,
          offsetInBatch + frontendPageSize
        );
        
        const totalInBatch = cached.vehicles.length;
        const totalPagesInBatch = Math.ceil(totalInBatch / frontendPageSize);
        const hasMoreInBatch = offsetInBatch + frontendPageSize < totalInBatch;
        
        logger.info(`✅ Redis HIT: ${paginatedVehicles.length}/${cached.vehicles.length} vehicles from batch ${batchNumber}`);
        
        // Calculate prefetch suggestion
        const currentPageInBatch = Math.floor(offsetInBatch / frontendPageSize) + 1;
        const shouldPrefetch = currentPageInBatch >= (totalPagesInBatch - CopartConfig.pagination.prefetchAheadPages);
        
        // Estimate total available across all batches
        // If current batch is full (50 items), assume more exist
        const isFullBatch = totalInBatch >= backendBatchSize;
        const estimatedTotalAvailable = isFullBatch 
          ? (batchNumber + 2) * backendBatchSize // Assume at least 2 batches exist
          : batchStartItem + totalInBatch; // This is the last batch
        
        return res.json({
          success: true,
          source: 'redis-cache',
          cached: true,
          fresh: false,
          query: query,
          page: pageNum,
          limit: frontendPageSize,
          returned: paginatedVehicles.length,
          totalAvailable: estimatedTotalAvailable,
          hasMore: isFullBatch,
          batch: {
            number: batchNumber,
            size: backendBatchSize,
            offsetInBatch: offsetInBatch,
            totalInBatch: totalInBatch,
            totalPagesInBatch: totalPagesInBatch,
            hasMoreInBatch: hasMoreInBatch,
            currentPageInBatch: currentPageInBatch
          },
          vehicles: paginatedVehicles,
          prefetch: shouldPrefetch ? {
            recommended: true,
            nextBatch: batchNumber + 1,
            url: `/api/search/prefetch?query=${encodeURIComponent(query)}&start_page=${(batchNumber + 1) * (backendBatchSize / frontendPageSize) + 1}&end_page=${(batchNumber + 2) * (backendBatchSize / frontendPageSize)}`
          } : {
            recommended: false,
            message: 'Still have enough cached pages'
          }
        });
      }
      
      // Step 2: Try Firestore batch (new optimized structure)
      logger.info(`Redis MISS, checking Firestore for batch ${batchNumber}...`);
      const firestoreBatch = await BatchRepository.getBatch(query, batchNumber);
      
      if (firestoreBatch && firestoreBatch.length > 0) {
        // Cache in Redis for next time (L1 cache) - 7 días
        await cache.set(cacheKey, { vehicles: firestoreBatch }, 604800);
        
        const paginatedVehicles = firestoreBatch.slice(
          offsetInBatch,
          offsetInBatch + frontendPageSize
        );
        
        const totalInBatch = firestoreBatch.length;
        const totalPagesInBatch = Math.ceil(totalInBatch / frontendPageSize);
        const hasMoreInBatch = offsetInBatch + frontendPageSize < totalInBatch;
        const currentPageInBatch = Math.floor(offsetInBatch / frontendPageSize) + 1;
        const shouldPrefetch = currentPageInBatch >= (totalPagesInBatch - CopartConfig.pagination.prefetchAheadPages);
        
        const isFullBatch = totalInBatch >= backendBatchSize;
        const estimatedTotalAvailable = isFullBatch 
          ? (batchNumber + 2) * backendBatchSize
          : batchStartItem + totalInBatch;
        
        logger.info(`✅ Firestore HIT: ${paginatedVehicles.length}/${firestoreBatch.length} vehicles from batch ${batchNumber}`);
        
        return res.json({
          success: true,
          source: 'firestore-cache',
          cached: true,
          fresh: false,
          query: query,
          page: pageNum,
          limit: frontendPageSize,
          returned: paginatedVehicles.length,
          totalAvailable: estimatedTotalAvailable,
          hasMore: isFullBatch,
          batch: {
            number: batchNumber,
            size: backendBatchSize,
            offsetInBatch: offsetInBatch,
            totalInBatch: totalInBatch,
            totalPagesInBatch: totalPagesInBatch,
            hasMoreInBatch: hasMoreInBatch,
            currentPageInBatch: currentPageInBatch
          },
          vehicles: paginatedVehicles,
          prefetch: shouldPrefetch ? {
            recommended: true,
            nextBatch: batchNumber + 1,
            url: `/api/search/prefetch?query=${encodeURIComponent(query)}&start_page=${(batchNumber + 1) * (backendBatchSize / frontendPageSize) + 1}&end_page=${(batchNumber + 2) * (backendBatchSize / frontendPageSize)}`
          } : {
            recommended: false,
            message: 'Still have enough cached pages'
          }
        });
      }
    }
    
    // Step 2: Cache miss - scrape full batch
    logger.info(`🌐 Cache MISS for batch ${batchNumber}, scraping ${backendBatchSize} items...`);
    
    const searchUrl = `https://www.copart.com/lotSearchResults/?free=true&query=${encodeURIComponent(query)}`;
    const platform = platformFactory.createScraper('copart');
    
    const scrapeStart = Date.now();
    
    // Scrape full batch (e.g., 50 vehicles)
    const copartPage = batchNumber + 1;
    const scrapedVehicles = await platform.scrape(
      searchUrl,
      backendBatchSize,
      undefined,
      copartPage,
      backendBatchSize
    );
    
    const scrapeDuration = (Date.now() - scrapeStart) / 1000;
    
    // ⚠️ CRITICAL: Only cache if we got results, otherwise allow retry
    if (scrapedVehicles.length === 0) {
      logger.warn(`⚠️ Scraping returned 0 vehicles for batch ${batchNumber}. NOT caching to allow retry.`);
      
      return res.status(404).json({
        success: false,
        error: 'No vehicles found for this batch',
        message: `Copart scraping failed for batch ${batchNumber}. This could be due to anti-bot protection or the batch doesn't exist.`,
        query: query,
        page: pageNum,
        batch: {
          number: batchNumber,
          attempted: true,
          vehiclesReturned: 0
        },
        suggestion: 'Try a different search or check if more pages exist'
      });
    }
    
    // Cache the full batch in Redis (L1) - 7 días TTL
    await cache.set(cacheKey, { vehicles: scrapedVehicles }, 604800);
    
    // Save to Firestore in background (L2 - optimized structure)
    BatchRepository.saveBatch(query, batchNumber, scrapedVehicles, scrapeDuration)
      .catch((err: any) => logger.error('Firestore batch save error:', err));
    
    // Also save individual vehicles to legacy collection (for backwards compatibility)
    Promise.all(
      scrapedVehicles.map((v: any, index: number) => {
        const vehicleWithIndex = {
          ...v,
          scraped_index: batchStartItem + index,
          scraped_batch: batchNumber,
          scraped_query: query
        };
        return VehicleRepository.upsertVehicle(vehicleWithIndex);
      })
    ).catch((err: any) => 
      logger.error('Legacy vehicle save error:', err)
    );
    
    // Return paginated slice
    const paginatedVehicles = scrapedVehicles.slice(
      offsetInBatch,
      offsetInBatch + frontendPageSize
    );
    
    const totalInBatch = scrapedVehicles.length;
    const totalPagesInBatch = Math.ceil(totalInBatch / frontendPageSize);
    const hasMoreInBatch = offsetInBatch + frontendPageSize < totalInBatch;
    const currentPageInBatch = Math.floor(offsetInBatch / frontendPageSize) + 1;
    const shouldPrefetch = currentPageInBatch >= (totalPagesInBatch - CopartConfig.pagination.prefetchAheadPages);
    
    // Estimate total available
    const isFullBatch = totalInBatch >= backendBatchSize;
    const estimatedTotalAvailable = isFullBatch 
      ? (batchNumber + 2) * backendBatchSize
      : batchStartItem + totalInBatch;
    
    logger.info(`✅ Scraped ${scrapedVehicles.length} vehicles in ${scrapeDuration}s, returning ${paginatedVehicles.length}`);
    
    // 🚀 Start background scraping for additional batches (non-blocking)
    // This will scrape batches 1, 2, 3 in background and cache them for future requests
    if (batchNumber === 0 && isFullBatch) {
      // Only trigger background scraping if:
      // 1. This is the first batch (batch 0)
      // 2. We got a full batch (50 vehicles), indicating more exist
      backgroundScraperService.startBackgroundScraping(query, batchNumber, backendBatchSize)
        .catch((err: any) => logger.error('Background scraping trigger error:', err));
      
      logger.info(`🔄 Background scraping triggered for "${query}" (will fetch batches 1-3)`);
    }
    
    res.json({
      success: true,
      source: 'copart',
      cached: false,
      fresh: true,
      query: query,
      page: pageNum,
      limit: frontendPageSize,
      returned: paginatedVehicles.length,
      totalAvailable: estimatedTotalAvailable,
      hasMore: isFullBatch,
      batch: {
        number: batchNumber,
        size: backendBatchSize,
        offsetInBatch: offsetInBatch,
        totalInBatch: totalInBatch,
        totalPagesInBatch: totalPagesInBatch,
        hasMoreInBatch: hasMoreInBatch,
        currentPageInBatch: currentPageInBatch
      },
      vehicles: paginatedVehicles,
      scrapeDurationSeconds: scrapeDuration,
      prefetch: shouldPrefetch ? {
        recommended: true,
        nextBatch: batchNumber + 1,
        url: `/api/search/prefetch?query=${encodeURIComponent(query)}&start_page=${(batchNumber + 1) * (backendBatchSize / frontendPageSize) + 1}&end_page=${(batchNumber + 2) * (backendBatchSize / frontendPageSize)}`
      } : {
        recommended: false,
        message: 'Still have enough cached pages'
      }
    });
    
  } catch (error) {
    logger.error('Hybrid search error:', error);
    res.status(500).json({ 
      success: false,
      error: 'An error occurred during the search',
      message: error instanceof Error ? error.message : 'Unknown error'
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

/**
 * GET /api/search/intelligent
 * 🧠 INTELLIGENT: Batch-based pagination with prefetch
 * 
 * System:
 * - 100 vehicles per Copart page (batch)
 * - 10 vehicles per frontend page
 * - 1 batch = 10 frontend pages
 * - Auto-prefetch when user reaches page 4, 14, 24, etc.
 * 
 * Structure: searches/{query}/batches/{batchNumber}
 * - Batch 0: Copart page 1 (vehicles 1-100) → Frontend pages 1-10
 * - Batch 1: Copart page 2 (vehicles 101-200) → Frontend pages 11-20
 * - Batch 2: Copart page 3 (vehicles 201-300) → Frontend pages 21-30
 * 
 * @param query - Search term (e.g., "toyota", "bmw")
 * @param page - Frontend page number (1-based)
 */
router.get('/intelligent', authenticateApiKey, rateLimiter(), async (req: Request, res: Response) => {
  try {
    logger.info('🧠 Intelligent endpoint called');
    const { query, page = '1' } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required'
      });
    }

    const frontendPage = parseInt(page as string, 10) || 1;
    
    if (frontendPage < 1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid page (page >= 1)'
      });
    }

    // Calculate which batch we need
    // Frontend page 1-10 → Batch 0
    // Frontend page 11-20 → Batch 1
    // Frontend page 21-30 → Batch 2
    const VEHICLES_PER_FRONTEND_PAGE = 10;
    const VEHICLES_PER_BATCH = 100;
    const PAGES_PER_BATCH = VEHICLES_PER_BATCH / VEHICLES_PER_FRONTEND_PAGE; // 10
    
    const batchNumber = Math.floor((frontendPage - 1) / PAGES_PER_BATCH);
    const pageWithinBatch = ((frontendPage - 1) % PAGES_PER_BATCH); // 0-9
    const startIndex = pageWithinBatch * VEHICLES_PER_FRONTEND_PAGE;
    const endIndex = startIndex + VEHICLES_PER_FRONTEND_PAGE;

    logger.info(`📊 Frontend page ${frontendPage} → Batch ${batchNumber}, slice [${startIndex}:${endIndex}]`);

    // Check if batch exists in cache
    const vehicles = await BatchRepository.getBatch(query, batchNumber);

    if (vehicles && vehicles.length > 0) {
      logger.info(`✅ Batch ${batchNumber} found in cache (${vehicles.length} vehicles)`);
      
      // Slice the batch to get only the vehicles for this page
      const pageVehicles = vehicles.slice(startIndex, endIndex);
      
      // Check if we need to prefetch next batch
      const shouldPrefetch = pageWithinBatch >= 2 && (pageWithinBatch < PAGES_PER_BATCH - 1);
      if (shouldPrefetch) {
        const nextBatch = batchNumber + 1;
        logger.info(`🔮 User at page ${frontendPage} (page ${pageWithinBatch + 1} in batch ${batchNumber}), checking if batch ${nextBatch} needs prefetch...`);
        
        // Trigger prefetch in background (don't wait)
        BatchRepository.getBatch(query, nextBatch).then(existingBatch => {
          if (!existingBatch) {
            // Check if already being scraped by another request
            if (scrapingLockService.isLocked(query, nextBatch)) {
              logger.info(`🔒 Batch ${nextBatch} already being scraped (prefetch skipped)`);
              return;
            }
            
            logger.info(`⚡ Batch ${nextBatch} not found, starting background prefetch scraping...`);
            
            // Execute scraper in background (non-blocking)
            (async () => {
              // Try to acquire lock
              const prefetchLockId = scrapingLockService.acquireLock(query, nextBatch);
              
              if (!prefetchLockId) {
                logger.info(`🔒 Could not acquire lock for prefetch batch ${nextBatch} (race condition)`);
                return;
              }
              
              try {
                const platform = platformFactory.createScraper('copart');
                const scrapeUrl = `https://www.copart.com/lotSearchResults/?free=true&query=${encodeURIComponent(query)}`;
                
                const scrapeStart = Date.now();
                const scrapedVehicles = await platform.scrape(
                  scrapeUrl,
                  VEHICLES_PER_BATCH, // 100
                  undefined,
                  nextBatch + 1, // Copart page number (1-based)
                  VEHICLES_PER_BATCH
                );
                const scrapeDuration = Math.round((Date.now() - scrapeStart) / 1000);
                
                if (scrapedVehicles && scrapedVehicles.length > 0) {
                  await BatchRepository.saveBatch(query, nextBatch, scrapedVehicles, scrapeDuration);
                  logger.info(`✅ Prefetch SUCCESS: Batch ${nextBatch} scraped and saved (${scrapedVehicles.length} vehicles in ${scrapeDuration}s)`);
                } else {
                  logger.warn(`⚠️ Prefetch returned 0 vehicles for batch ${nextBatch}`);
                }
              } catch (error) {
                logger.error(`❌ Prefetch scraping error for batch ${nextBatch}:`, error);
              } finally {
                // Always release lock
                scrapingLockService.releaseLock(query, nextBatch, prefetchLockId);
              }
            })(); // Execute immediately but don't await (non-blocking)
          } else {
            logger.info(`✅ Batch ${nextBatch} already cached (${existingBatch.length} vehicles), no prefetch needed`);
          }
        }).catch(err => logger.error('Prefetch check error:', err));
      }
      
      return res.json({
        success: true,
        source: 'cache',
        cached: true,
        query,
        page: frontendPage,
        hasMore: true, // Asumir que hay más batches disponibles
        batch: {
          number: batchNumber,
          totalInBatch: vehicles.length,
          pageWithinBatch: pageWithinBatch + 1,
          pagesInBatch: PAGES_PER_BATCH
        },
        returned: pageVehicles.length,
        vehicles: pageVehicles,
        timestamp: new Date().toISOString()
      });
    }

    // Batch not found - need to scrape
    logger.info(`❌ Batch ${batchNumber} not found, checking if scraping in progress...`);
    
    // Check if another request is already scraping this batch
    if (scrapingLockService.isLocked(query, batchNumber)) {
      logger.info(`⏳ Batch ${batchNumber} is being scraped by another request, waiting...`);
      
      // Wait for the other scraping to complete (max 15 minutos)
      const lockReleased = await scrapingLockService.waitForLock(query, batchNumber, 15 * 60 * 1000);
      
      if (lockReleased) {
        // Lock was released, try to get batch from cache again
        const vehiclesAfterWait = await BatchRepository.getBatch(query, batchNumber);
        if (vehiclesAfterWait && vehiclesAfterWait.length > 0) {
          logger.info(`✅ Batch ${batchNumber} now available after waiting (${vehiclesAfterWait.length} vehicles)`);
          const pageVehicles = vehiclesAfterWait.slice(startIndex, endIndex);
          
          return res.json({
            success: true,
            source: 'firestore-after-wait',
            cached: true,
            query,
            page: frontendPage,
            hasMore: true,
            batch: {
              number: batchNumber,
              totalInBatch: vehiclesAfterWait.length,
              pageWithinBatch: pageWithinBatch + 1,
              pagesInBatch: PAGES_PER_BATCH
            },
            returned: pageVehicles.length,
            vehicles: pageVehicles,
            timestamp: new Date().toISOString()
          });
        }
      }
      
      logger.warn(`⚠️ Wait timeout or batch still not available, will scrape now`);
    }
    
    // Try to acquire lock for scraping
    const lockId = scrapingLockService.acquireLock(query, batchNumber);
    
    if (!lockId) {
      // Another request just acquired the lock, wait again
      logger.info(`🔒 Could not acquire lock (race condition), waiting again...`);
      await scrapingLockService.waitForLock(query, batchNumber, 15 * 60 * 1000);
      
      // Try to get from cache after second wait
      const vehiclesAfterRetry = await BatchRepository.getBatch(query, batchNumber);
      if (vehiclesAfterRetry) {
        const pageVehicles = vehiclesAfterRetry.slice(startIndex, endIndex);
        return res.json({
          success: true,
          source: 'firestore-after-retry',
          cached: true,
          query,
          page: frontendPage,
          hasMore: true,
          batch: {
            number: batchNumber,
            totalInBatch: vehiclesAfterRetry.length,
            pageWithinBatch: pageWithinBatch + 1,
            pagesInBatch: PAGES_PER_BATCH
          },
          returned: pageVehicles.length,
          vehicles: pageVehicles,
          timestamp: new Date().toISOString()
        });
      }
      
      return res.status(500).json({
        success: false,
        error: 'Could not scrape batch after retries'
      });
    }
    
    logger.info(`🔐 Lock acquired for batch ${batchNumber}, starting scrape...`);
    
    try {
      const platform = platformFactory.createScraper('copart');
      const copartUrl = `https://www.copart.com/lotSearchResults/?free=true&query=${encodeURIComponent(query)}`;
      
      const scrapeStartTime = Date.now();
      
      // Scrape 100 vehicles (1 Copart page with 100 results per page)
      const scrapedVehicles = await platform.scrape(
        copartUrl,
        VEHICLES_PER_BATCH, // 100
        undefined,
        batchNumber + 1, // Copart page number (1-based)
        VEHICLES_PER_BATCH
      );
      
      const scrapeDuration = Math.round((Date.now() - scrapeStartTime) / 1000);
      logger.info(`⏱️  Scraping took ${scrapeDuration} seconds`);

      if (!scrapedVehicles || scrapedVehicles.length === 0) {
        logger.warn(`⚠️  No vehicles found for batch ${batchNumber}`);
        
        // Release lock before returning error
        scrapingLockService.releaseLock(query, batchNumber, lockId);
        
        return res.status(404).json({
          success: false,
          error: 'No vehicles found for this batch',
          message: 'Copart scraping failed or no results available',
          query,
          page: frontendPage,
          batch: {
            number: batchNumber,
            attempted: true,
            vehiclesReturned: 0
          },
          scrapeDurationSeconds: scrapeDuration
        });
      }

      // Save batch to Firestore
      await BatchRepository.saveBatch(query, batchNumber, scrapedVehicles, scrapeDuration);
      logger.info(`✅ Scraped and saved batch ${batchNumber}: ${scrapedVehicles.length} vehicles`);
      
      // Release lock after successful scraping
      scrapingLockService.releaseLock(query, batchNumber, lockId);

      // Return the requested page from the freshly scraped batch
      const pageVehicles = scrapedVehicles.slice(startIndex, endIndex);

      return res.json({
        success: true,
        source: 'copart',
        cached: false,
        fresh: true,
        query,
        page: frontendPage,
        hasMore: true, // Asumir que hay más batches disponibles
        batch: {
          number: batchNumber,
          totalInBatch: scrapedVehicles.length,
          pageWithinBatch: pageWithinBatch + 1,
          pagesInBatch: PAGES_PER_BATCH
        },
        returned: pageVehicles.length,
        vehicles: pageVehicles,
        scrapeDurationSeconds: scrapeDuration,
        timestamp: new Date().toISOString()
      });
    } catch (scrapingError: any) {
      logger.error('Scraping error:', scrapingError);
      
      // Release lock on error
      if (lockId) {
        scrapingLockService.releaseLock(query, batchNumber, lockId);
      }
      
      return res.status(500).json({
        success: false,
        error: 'Scraping failed',
        message: scrapingError.message
      });
    }

  } catch (error: any) {
    logger.error('Intelligent search error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Search failed',
      message: error.message
    });
  }
});

/**
 * GET /api/search/optimized
 * ⚠️ DEPRECATED: Use /api/search/intelligent instead
 */
router.get('/optimized', authenticateApiKey, rateLimiter(), async (req: Request, res: Response) => {
  return res.status(410).json({
    success: false,
    error: 'This endpoint has been deprecated',
    message: 'Please use /api/search/intelligent instead',
    migration: {
      old: '/api/search/optimized?query=toyota&page=1',
      new: '/api/search/intelligent?query=toyota&page=1'
    }
  });
});

/**
 * GET /api/search/prefetch
 * Prefetch next pages in background for smooth pagination
 * 
 * Strategy:
 * - Frontend pagination: 10 items per page
 * - Backend batching: 50 items per request
 * - When user is on page 3-4, prefetch pages 6-10
 * - When user is on page 8-9, prefetch pages 11-15
 * 
 * Example:
 * GET /api/search/prefetch?query=toyota&start_page=6&end_page=10
 */
router.get('/prefetch', authenticateApiKey, rateLimiter(), async (req: Request, res: Response) => {
  try {
    const { query, start_page = '6', end_page = '10' } = req.query;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ 
        success: false,
        error: 'Query parameter is required',
        example: '/api/search/prefetch?query=toyota&start_page=6&end_page=10'
      });
    }
    
    const startPageNum = parseInt(start_page as string, 10);
    const endPageNum = parseInt(end_page as string, 10);
    const frontendPageSize = CopartConfig.pagination.frontendPageSize;
    const backendBatchSize = CopartConfig.pagination.backendBatchSize;
    
    logger.info(`Prefetch: query="${query}" pages ${startPageNum}-${endPageNum}`);
    
    // Calculate which batches we need to prefetch
    const startBatch = Math.floor((startPageNum - 1) * frontendPageSize / backendBatchSize);
    const endBatch = Math.floor((endPageNum - 1) * frontendPageSize / backendBatchSize);
    
    const batchesToFetch = [];
    for (let batch = startBatch; batch <= endBatch; batch++) {
      batchesToFetch.push(batch);
    }
    
    logger.info(`Batches to prefetch: ${batchesToFetch.join(', ')}`);
    
    const results = [];
    const searchUrl = `https://www.copart.com/vehicleFinder?query=${encodeURIComponent(query)}`;
    const platform = platformFactory.createScraper('copart');
    
    for (const batchNum of batchesToFetch) {
      const cacheKey = `search:${query}:batch:${batchNum}:size:${backendBatchSize}`;
      
      // Skip if already cached
      const cached = await cache.get<any>(cacheKey);
      if (cached?.vehicles) {
        logger.info(`Batch ${batchNum} already cached (${cached.vehicles.length} vehicles)`);
        results.push({
          batch: batchNum,
          status: 'already_cached',
          cached: true,
          vehicleCount: cached.vehicles.length
        });
        continue;
      }
      
      // Scrape batch
      const batchStartItem = batchNum * backendBatchSize;
      const copartPage = Math.floor(batchStartItem / backendBatchSize) + 1;
      
      logger.info(`Scraping batch ${batchNum} (Copart page ${copartPage})`);
      
      const scrapeStart = Date.now();
      const scrapedVehicles = await platform.scrape(
        searchUrl,
        backendBatchSize,
        undefined,
        copartPage,
        backendBatchSize
      );
      const scrapeDuration = (Date.now() - scrapeStart) / 1000;
      
      // Cache batch - 7 días TTL
      await cache.set(cacheKey, { vehicles: scrapedVehicles }, 604800);
      
      // Save to Firestore in background
      Promise.all(
        scrapedVehicles.map((v: any) => VehicleRepository.upsertVehicle(v))
      ).catch((err: any) =>
        logger.error('Prefetch save error:', err)
      );
      
      results.push({
        batch: batchNum,
        status: 'prefetched',
        cached: true,
        vehicleCount: scrapedVehicles.length,
        durationSeconds: scrapeDuration
      });
      
      logger.info(`Prefetched batch ${batchNum}: ${scrapedVehicles.length} vehicles in ${scrapeDuration}s`);
    }
    
    const totalFetched = results.filter(r => r.status === 'prefetched').length;
    const totalCached = results.filter(r => r.status === 'already_cached').length;
    
    res.json({
      success: true,
      query: query,
      requestedPages: `${startPageNum}-${endPageNum}`,
      batches: results,
      summary: {
        totalBatches: results.length,
        newlyFetched: totalFetched,
        alreadyCached: totalCached
      },
      config: {
        frontendPageSize,
        backendBatchSize,
        pagesPerBatch: backendBatchSize / frontendPageSize
      }
    });
    
  } catch (error) {
    logger.error('Prefetch error:', error);
    res.status(500).json({ 
      success: false,
      error: 'An error occurred during prefetch',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
