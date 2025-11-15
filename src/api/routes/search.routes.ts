import { Router, Request, Response } from 'express';
import { BatchRepository } from '../../services/repositories/batch.repository';
import { Logger } from '../../config/logger';
import { authenticateApiKey } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { platformFactory } from '../../services/scrapers/platforms/platform.factory';
import { scrapingLockService } from '../../services/scraping-lock.service';

const router = Router();
const logger = Logger.getInstance();

/**
 * Helper function to trigger prefetch of next page in background
 * Called after cache hits AND after successful scraping
 */
const triggerPrefetch = async (query: string, currentPage: number, limitNum: number) => {
  const nextPage = currentPage + 1;
  
  logger.debug(`🔍 Checking if prefetch needed for page ${nextPage} (limit ${limitNum})...`);
  
  try {
    const existingPage = await BatchRepository.getPage(query, nextPage, limitNum);
    
    if (existingPage && existingPage.length > 0) {
      logger.info(`✅ Page ${nextPage} (limit ${limitNum}) already cached (${existingPage.length} vehicles), no prefetch needed`);
      return;
    }
    
    // Check if already being scraped
    if (scrapingLockService.isLocked(query, nextPage, limitNum)) {
      logger.info(`🔒 Page ${nextPage} (limit ${limitNum}) already being scraped (prefetch skipped)`);
      return;
    }
    
    logger.info(`⚡ Prefetch triggered: query="${query}", current page=${currentPage}, next page=${nextPage}, limit=${limitNum}`);
    
    // Execute scraper in background (non-blocking)
    (async () => {
      const prefetchLockId = scrapingLockService.acquireLock(query, nextPage, limitNum);
      
      if (!prefetchLockId) {
        logger.info(`🔒 Could not acquire lock for prefetch (race condition)`);
        return;
      }
      
      try {
        const platform = platformFactory.createScraper('copart');
        const scrapeUrl = `https://www.copart.com/lotSearchResults/?free=true&query=${encodeURIComponent(query)}`;
        
        const scrapeStart = Date.now();
        const scrapedVehicles = await platform.scrape(
          scrapeUrl,
          limitNum,
          undefined,
          nextPage,
          limitNum
        );
        const scrapeDuration = Math.round((Date.now() - scrapeStart) / 1000);
        
        if (scrapedVehicles && scrapedVehicles.length > 0) {
          await BatchRepository.savePage(query, nextPage, limitNum, scrapedVehicles, scrapeDuration);
          logger.info(`✅ Prefetch SUCCESS: Page ${nextPage} (limit ${limitNum}) scraped (${scrapedVehicles.length} vehicles in ${scrapeDuration}s)`);
        } else {
          logger.warn(`⚠️ Prefetch returned 0 vehicles for page ${nextPage}`);
        }
      } catch (error) {
        logger.error(`❌ Prefetch scraping error for page ${nextPage}:`, error);
      } finally {
        scrapingLockService.releaseLock(query, nextPage, limitNum, prefetchLockId);
      }
    })();
  } catch (error) {
    logger.error('Prefetch check error:', error);
  }
};

/**
 * GET /api/search/intelligent
 * Sistema de búsqueda inteligente con cache dinámico y prefetch
 * - Usuario elige límite: 10 (~2min), 50 (~10min), o 100 (~20min) vehículos
 * - 1 página frontend = 1 cache document = exactamente {limit} vehículos
 * - Prefetch automático de next page con mismo límite
 * - Retry automático ante bloqueos de Copart
 * - Cache de 7 días en Firestore
 * - Lock único por combinación query+page+limit
 */
router.get('/intelligent', authenticateApiKey, rateLimiter(), async (req: Request, res: Response) => {
  try {
    logger.info('🧠 Intelligent endpoint called');
    const { query, page = '1', limit = '10' } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required'
      });
    }

    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 10;
    
    // Validate limit (10, 50, or 100)
    if (![10, 50, 100].includes(limitNum)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid limit. Must be 10, 50, or 100'
      });
    }
    
    if (pageNum < 1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid page (page >= 1)'
      });
    }

    const cacheKey = `${pageNum}-${limitNum}`;
    logger.info(`📊 Request: page ${pageNum}, limit ${limitNum} → cache key: ${cacheKey}`);

    // Check if page exists in cache
    const vehicles = await BatchRepository.getPage(query, pageNum, limitNum);

    if (vehicles && vehicles.length > 0) {
      logger.info(`✅ Page ${pageNum} (limit ${limitNum}) found in cache (${vehicles.length} vehicles)`);
      
      // Trigger prefetch in background for next page (don't wait)
      triggerPrefetch(query, pageNum, limitNum);
      
      return res.json({
        success: true,
        source: 'cache',
        cached: true,
        query,
        page: pageNum,
        limit: limitNum,
        hasMore: true,
        returned: vehicles.length,
        vehicles: vehicles,
        timestamp: new Date().toISOString()
      });
    }

    // Page not found - need to scrape
    logger.info(`❌ Page ${pageNum} (limit ${limitNum}) not found in cache, checking if scraping in progress...`);
    
    // Check if another request is already scraping this page
    if (scrapingLockService.isLocked(query, pageNum, limitNum)) {
      logger.info(`⏳ Page ${pageNum} (limit ${limitNum}) is being scraped by another request, waiting...`);
      
      // Calculate dynamic timeout based on limit (150ms per vehicle)
      const timeoutMs = Math.min(limitNum * 150, 15 * 60 * 1000); // Max 15 min
      const lockReleased = await scrapingLockService.waitForLock(query, pageNum, limitNum, timeoutMs);
      
      if (lockReleased) {
        // Lock was released, try to get page from cache again
        const vehiclesAfterWait = await BatchRepository.getPage(query, pageNum, limitNum);
        if (vehiclesAfterWait && vehiclesAfterWait.length > 0) {
          logger.info(`✅ Page ${pageNum} (limit ${limitNum}) now available after waiting (${vehiclesAfterWait.length} vehicles)`);
          
          return res.json({
            success: true,
            source: 'cache-after-wait',
            cached: true,
            query,
            page: pageNum,
            limit: limitNum,
            hasMore: true,
            returned: vehiclesAfterWait.length,
            vehicles: vehiclesAfterWait,
            timestamp: new Date().toISOString()
          });
        }
      }
      
      logger.warn(`⚠️ Wait timeout or page still not available, will scrape now`);
    }
    
    // Try to acquire lock for scraping
    const lockId = scrapingLockService.acquireLock(query, pageNum, limitNum);
    
    if (!lockId) {
      // Another request just acquired the lock, wait again
      logger.info(`🔒 Could not acquire lock (race condition), waiting again...`);
      const timeoutMs = Math.min(limitNum * 150, 15 * 60 * 1000);
      await scrapingLockService.waitForLock(query, pageNum, limitNum, timeoutMs);
      
      // Try to get from cache after second wait
      const vehiclesAfterRetry = await BatchRepository.getPage(query, pageNum, limitNum);
      if (vehiclesAfterRetry) {
        return res.json({
          success: true,
          source: 'cache-after-retry',
          cached: true,
          query,
          page: pageNum,
          limit: limitNum,
          hasMore: true,
          returned: vehiclesAfterRetry.length,
          vehicles: vehiclesAfterRetry,
          timestamp: new Date().toISOString()
        });
      }
      
      return res.status(500).json({
        success: false,
        error: 'Could not scrape page after retries'
      });
    }
    
    logger.info(`🔐 Lock acquired for page ${pageNum} (limit ${limitNum}), starting scrape...`);
    
    try {
      const platform = platformFactory.createScraper('copart');
      const copartUrl = `https://www.copart.com/lotSearchResults/?free=true&query=${encodeURIComponent(query)}`;
      
      const scrapeStartTime = Date.now();
      
      // Scrape exactly {limit} vehicles from specified page
      const scrapedVehicles = await platform.scrape(
        copartUrl,
        limitNum,
        undefined,
        pageNum,
        limitNum
      );
      
      const scrapeDuration = Math.round((Date.now() - scrapeStartTime) / 1000);
      logger.info(`⏱️  Scraping took ${scrapeDuration} seconds`);

      if (!scrapedVehicles || scrapedVehicles.length === 0) {
        logger.warn(`⚠️  No vehicles found for page ${pageNum} (limit ${limitNum})`);
        
        // Release lock before returning error
        scrapingLockService.releaseLock(query, pageNum, limitNum, lockId);
        
        return res.status(404).json({
          success: false,
          error: 'No vehicles found for this page',
          message: 'Copart scraping failed or no results available',
          query,
          page: pageNum,
          limit: limitNum,
          scrapeDurationSeconds: scrapeDuration
        });
      }

      // Save page to Firestore
      await BatchRepository.savePage(query, pageNum, limitNum, scrapedVehicles, scrapeDuration);
      logger.info(`✅ Scraped and saved page ${pageNum} (limit ${limitNum}): ${scrapedVehicles.length} vehicles`);
      
      // Release lock after successful scraping
      scrapingLockService.releaseLock(query, pageNum, limitNum, lockId);

      // Trigger prefetch of next page in background (don't wait)
      triggerPrefetch(query, pageNum, limitNum);

      return res.json({
        success: true,
        source: 'copart',
        cached: false,
        fresh: true,
        query,
        page: pageNum,
        limit: limitNum,
        hasMore: true,
        returned: scrapedVehicles.length,
        vehicles: scrapedVehicles,
        scrapeDurationSeconds: scrapeDuration,
        timestamp: new Date().toISOString()
      });
    } catch (scrapingError: any) {
      logger.error('Scraping error:', scrapingError);
      
      // Release lock on error
      if (lockId) {
        scrapingLockService.releaseLock(query, pageNum, limitNum, lockId);
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
 * GET /api/search/test
 * Endpoint de prueba avanzado con opciones de debugging
 * 
 * Parámetros:
 * - query: término de búsqueda (ej: "mazda")
 * - url: URL personalizada (alternativa a query)
 * - page: número de página (default: 1)
 * - limit: número de vehículos (default: 5, opciones: 5, 10, 20, 50, 100)
 * - headless: false para ver el navegador (default: true, solo funciona local)
 * - debug: true para logs detallados (default: false)
 * 
 * Ejemplos:
 * - /api/search/test?query=mazda&page=1
 * - /api/search/test?query=toyota&limit=20
 * - /api/search/test?query=honda&headless=false&debug=true (solo local)
 * - /api/search/test?url=https://www.copart.com/lot/12345
 */
router.get('/test', authenticateApiKey, rateLimiter(), async (req: Request, res: Response) => {
  try {
    logger.info('🧪 Test endpoint called');
    const { 
      query, 
      url: customUrl,
      page = '1',
      limit = '5',
      headless = 'true',
      debug = 'false'
    } = req.query;

    // Validar que haya query o url
    if (!query && !customUrl) {
      return res.status(400).json({
        success: false,
        error: 'Either "query" or "url" parameter is required',
        examples: {
          byQuery: '/api/search/test?query=ford&page=1',
          byUrl: '/api/search/test?url=https://www.copart.com/lot/12345',
          withLimit: '/api/search/test?query=toyota&limit=20',
          withDebug: '/api/search/test?query=honda&headless=false&debug=true (local only)'
        }
      });
    }

    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = Math.min(parseInt(limit as string, 10) || 10, 100); // Max 100
    const useHeadless = headless === 'true';
    const useDebug = debug === 'true';
    
    if (pageNum < 1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid page (page >= 1)'
      });
    }

    // Construir URL
    let targetUrl: string;
    if (customUrl && typeof customUrl === 'string') {
      targetUrl = customUrl;
      logger.info(`🧪 Test scrape: customUrl="${targetUrl}", limit=${limitNum}, headless=${useHeadless}, debug=${useDebug}`);
    } else {
      targetUrl = `https://www.copart.com/lotSearchResults/?free=true&query=${encodeURIComponent(query as string)}`;
      logger.info(`🧪 Test scrape: query="${query}", page=${pageNum}, limit=${limitNum}, headless=${useHeadless}, debug=${useDebug}`);
    }
    
    // Crear scraper con opciones personalizadas
    const platform = platformFactory.createScraper('copart', {
      headless: useHeadless,
      debug: useDebug
    });
    
    const scrapeStartTime = Date.now();
    
    // Scrape con límite personalizado
    const scrapedVehicles = await platform.scrape(
      targetUrl,
      limitNum,
      undefined,
      pageNum,
      limitNum
    );
    
    const scrapeDuration = Math.round((Date.now() - scrapeStartTime) / 1000);
    logger.info(`⏱️  Test scraping took ${scrapeDuration} seconds`);

    if (!scrapedVehicles || scrapedVehicles.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No vehicles found',
        query: query || null,
        url: customUrl || null,
        page: pageNum,
        limit: limitNum,
        scrapeDurationSeconds: scrapeDuration,
        options: {
          headless: useHeadless,
          debug: useDebug
        }
      });
    }

    return res.json({
      success: true,
      source: 'copart-test',
      cached: false,
      fresh: true,
      query: query || null,
      url: customUrl || null,
      page: pageNum,
      limit: limitNum,
      returned: scrapedVehicles.length,
      vehicles: scrapedVehicles,
      scrapeDurationSeconds: scrapeDuration,
      timestamp: new Date().toISOString(),
      options: {
        headless: useHeadless,
        debug: useDebug
      },
      note: 'This is a test endpoint. Use /api/search/intelligent for production. headless=false only works locally.'
    });

  } catch (error: any) {
    logger.error('Test search error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Test search failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/search/stats
 * Estadísticas del sistema de scraping
 */
router.get('/stats', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const locks = scrapingLockService.getAllLocks();
    
    return res.json({
      success: true,
      stats: {
        activeLocks: locks.length,
        locks: locks.map((lock) => ({
          query: lock.query,
          page: lock.page,
          limit: lock.limit,
          lockedAt: new Date(lock.startTime).toISOString(),
          ageSeconds: Math.round((Date.now() - lock.startTime) / 1000),
          lockId: lock.lockId
        }))
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('Stats error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to get stats',
      message: error.message
    });
  }
});

/**
 * GET /api/search/popular
 * Obtiene las búsquedas más populares del cache
 * Útil para mostrar sugerencias al usuario con datos ya disponibles
 */
router.get('/popular', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const { limit = '10' } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10) || 10, 50);
    
    logger.info(`📊 Getting ${limitNum} popular searches`);
    
    const popularSearches = await BatchRepository.getPopularSearches(limitNum);
    
    return res.json({
      success: true,
      searches: popularSearches,
      count: popularSearches.length,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('Popular searches error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to get popular searches',
      message: error.message
    });
  }
});

export default router;
