/**
 * SearchController - Handles search logic
 * Single Responsibility: Search orchestration with async job queue
 */

import { Logger } from '../../config/logger';
import { BatchRepository } from '../../services/repositories/batch.repository';
import { VehicleRepository } from '../../services/repositories/vehicle.repository';
import { platformFactory } from '../../services/scrapers/platforms/platform.factory';
import { scrapingLockService } from '../../services/queue/scraping-lock.service';
import JobQueueManager from '../../services/queue/job-queue';
import { JobQueueSecurityService } from '../../services/security/job-queue-security.service';
import { CacheService } from '../../services/cache.service';
import { v4 as uuidv4 } from 'uuid';
import { OptimizedVehicle, VehicleData } from '../../types/vehicle.types';
import { BatchVehicle, PopularSearch } from '../../types';

const logger = Logger.getInstance();
const queueManager = JobQueueManager.getInstance();
const securityService = JobQueueSecurityService.getInstance();
// L1 Cache (Redis)
const cacheService = CacheService.getInstance();

export interface SearchOptions {
  query: string;
  page: number;
  limit: number;
  clientIp?: string;
  apiKey?: string;
  async?: boolean; // Use async queue or sync processing
}

export interface SearchResult {
  success: boolean;
  source: 'cache' | 'redis' | 'live' | 'lock-wait' | 'queued';
  cached: boolean;
  query: string;
  page: number;
  limit: number;
  returned: number;
  vehicles?: OptimizedVehicle[] | VehicleData[] | BatchVehicle[];
  batchId?: string; // For async jobs
  status?: 'queued' | 'processing' | 'completed' | 'failed';
  scrapeDurationSeconds?: number;
  error?: string;
  vehiclesFound?: number;
}

export class SearchController {
  /**
   * Intelligent search with cache (L1 Redis, L2 Firestore), queue, and prefetch
   * Can work in sync or async mode
   */
  async intelligentSearch(options: SearchOptions): Promise<SearchResult> {
    const { query, page, limit, clientIp, apiKey, async = false } = options;

    logger.info(
      `🔍 Search vehicles: query="${query}", page=${page}, limit=${limit}, async=${async}`,
    );

    // Security validation
    const securityCheck = await securityService.canSubmitJob(clientIp || 'unknown', apiKey);
    if (!securityCheck.allowed) {
      throw new Error(securityCheck.reason || 'Security check failed');
    }

    const queryValidation = securityService.validateQuery(query);
    if (!queryValidation.valid) {
      throw new Error(queryValidation.reason || 'Invalid query');
    }

    const paginationValidation = securityService.validatePagination(page, limit);
    if (!paginationValidation.valid) {
      throw new Error(paginationValidation.reason || 'Invalid pagination');
    }

    const sanitizedQuery = queryValidation.sanitized!;

    // 1. Check L1 Cache (Redis) - Ultrarapid (< 5 ms)
    try {
      const redisResult = await cacheService.getCachedSearchResults(sanitizedQuery, page, limit);

      if (redisResult && Array.isArray(redisResult) && redisResult.length > 0) {
        logger.info(`✅ CACHE HIT (Redis L1): Found ${redisResult.length} vehicles for page ${page}`);

        // Trigger prefetch in background (so L2 and next pages stay fresh)
        this.triggerPrefetch(sanitizedQuery, page, limit);

        return {
          success: true,
          source: 'redis',
          cached: true,
          query: sanitizedQuery,
          page,
          limit,
          returned: redisResult.length,
          vehicles: redisResult as VehicleData[],
        };
      }
    } catch (e) {
      logger.warn('Redis L1 check failed', e);
    }

    // 2. Check L2 Cache (Firestore) - Persistent + Shared
    const cachedPage = await BatchRepository.getPage(sanitizedQuery, page, limit);

    if (cachedPage && cachedPage.length > 0) {
      logger.info(`✅ CACHE HIT (Firestore L2): Found ${cachedPage.length} vehicles for page ${page}`);

      // Populate L1 Cache for next time
      cacheService.cacheSearchResults(sanitizedQuery, page, limit, cachedPage).catch(e => logger.error('L1 population error:', e));

      // Trigger prefetch in background
      this.triggerPrefetch(sanitizedQuery, page, limit);

      return {
        success: true,
        source: 'cache',
        cached: true,
        query: sanitizedQuery,
        page,
        limit,
        returned: cachedPage.length,
        vehicles: cachedPage,
      };
    }

    logger.info(`❌ CACHE MISS: Page ${page} not found`);

    // If async mode, queue the job
    if (async) {
      return await this.queueSearchJob(sanitizedQuery, page, limit, clientIp, apiKey);
    }

    // Sync mode: Check if already being scraped
    if (scrapingLockService.isLocked(sanitizedQuery, page, limit)) {
      logger.info(`🔒 Already being scraped, waiting for result...`);

      const waitResult = await this.waitForScraping(sanitizedQuery, page, limit);

      if (waitResult.success) {
        return {
          ...waitResult,
          source: 'lock-wait',
          cached: false,
        };
      }
    }

    // Acquire lock and scrape synchronously
    const lockId = scrapingLockService.acquireLock(sanitizedQuery, page, limit);

    if (!lockId) {
      throw new Error('Could not acquire scraping lock');
    }

    try {
      return await this.performScraping(sanitizedQuery, page, limit);
    } finally {
      scrapingLockService.releaseLock(sanitizedQuery, page, limit, lockId);
    }
  }

  /**
   * Queue search job for async processing
   */
  private async queueSearchJob(
    query: string,
    page: number,
    limit: number,
    clientIp?: string,
    apiKey?: string,
  ): Promise<SearchResult> {
    const batchId = uuidv4();
    const priority = securityService.calculatePriority(apiKey, limit);

    logger.info(`📋 Queueing search job: batch=${batchId}, query="${query}", priority=${priority}`);

    try {
      // Increment concurrent jobs counter
      await securityService.incrementConcurrentJobs(clientIp || 'unknown', apiKey);

      // Add job to queue
      await queueManager.addJob('SCRAPE_COPART', {
        batchId,
        query,
        page,
        limit,
        clientIp,
        apiKey,
        priority,
      });

      // Save initial job status
      await BatchRepository.updateJobStatus(batchId, 'queued', {
        query,
        page,
        limit,
        priority,
        createdAt: new Date().toISOString(),
      });

      return {
        success: true,
        source: 'queued',
        cached: false,
        query,
        page,
        limit,
        returned: 0,
        batchId,
        status: 'queued',
      };
    } catch (error: unknown) {
      logger.error('Error queueing search job:', error);
      await securityService.decrementConcurrentJobs(clientIp || 'unknown', apiKey);
      throw error;
    }
  }

  /**
   * Get job status by batchId
   */
  async getJobStatus(batchId: string): Promise<SearchResult | { success: false; error: string }> {
    try {
      const jobStatus = await BatchRepository.getJobStatus(batchId);

      if (!jobStatus) {
        return {
          success: false,
          error: 'Job not found',
        };
      }

      // If completed, fetch results from cache
      if (jobStatus.status === 'completed') {
        const vehicles = await BatchRepository.getPage(
          (jobStatus.query as string) || '',
          jobStatus.page as number,
          jobStatus.limit as number,
        );

        // Also populate L1 Cache
        if (vehicles && vehicles.length > 0) {
          cacheService.cacheSearchResults(jobStatus.query as string, jobStatus.page as number, jobStatus.limit as number, vehicles).catch(() => { });
        }

        return {
          success: true,
          status: jobStatus.status,
          query: (jobStatus.query as string) || '',
          page: (jobStatus.page as number) || 1,
          limit: (jobStatus.limit as number) || 10,
          ...jobStatus,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          source: (jobStatus as any).source || 'cache',
          cached: true,
          vehicles: vehicles || [],
          vehiclesFound: vehicles?.length || 0,
          returned: vehicles?.length || 0,
        };
      }

      return {
        success: true,
        ...jobStatus,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        source: (jobStatus as any).source || 'queued',
        cached: false,
        returned: 0,
        query: (jobStatus.query as string) || '',
        page: (jobStatus.page as number) || 1,
        limit: (jobStatus.limit as number) || 10,
      };
    } catch (error: unknown) {
      const dbError = error as Error;
      logger.error(`Error getting job status ${batchId}:`, dbError);
      return {
        success: false,
        error: dbError.message,
      };
    }
  }

  /**
   * Test search with debug options
   */
  async testSearch(
    options: SearchOptions & { headless?: boolean; debug?: boolean },
  ): Promise<SearchResult> {
    const { query, page, limit, headless, debug } = options;

    logger.info(`🧪 Test search: query="${query}", page=${page}, limit=${limit}`);

    const platform = platformFactory.createScraper('copart', {
      headless: headless !== false,
      debug: debug === true,
    });

    const scrapeUrl = `https://www.copart.com/lotSearchResults/?free=true&query=${encodeURIComponent(query)}`;

    const scrapeStart = Date.now();
    const vehicles = await platform.scrape(scrapeUrl, limit, undefined, page, limit);
    const scrapeDuration = Math.round((Date.now() - scrapeStart) / 1000);

    return {
      success: true,
      source: 'live',
      cached: false,
      query,
      page,
      limit,
      returned: vehicles.length,
      vehicles,
      scrapeDurationSeconds: scrapeDuration,
    };
  }

  /**
   * Get scraping statistics
   */
  async getStats() {
    const locks = scrapingLockService.getAllLocks();

    return {
      success: true,
      stats: {
        activeLocks: locks.length,
        locks: locks.map(
          (lock: { query: string; page: number; limit: number; startTime: number }) => ({
            query: lock.query,
            page: lock.page,
            limit: lock.limit,
            ageSeconds: Math.round((Date.now() - lock.startTime) / 1000),
          }),
        ),
      },
    };
  }

  /**
   * Get popular searches from cache
   */
  async getPopular(limit: number = 10): Promise<PopularSearch[]> {
    return await BatchRepository.getPopularSearches(Math.min(limit, 50));
  }

  // ============= Private Methods =============

  /**
   * Wait for ongoing scraping to complete
   */
  private async waitForScraping(
    query: string,
    page: number,
    limit: number,
    maxWaitMs: number = 180000,
  ): Promise<SearchResult> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Try L1 first in loops? Maybe not needed for wait loop. L2 is fine.
      const cachedPage = await BatchRepository.getPage(query, page, limit);

      if (cachedPage && cachedPage.length > 0) {
        logger.info(`✅ Lock wait SUCCESS: Found ${cachedPage.length} vehicles`);
        return {
          success: true,
          source: 'lock-wait',
          cached: false,
          query,
          page,
          limit,
          returned: cachedPage.length,
          vehicles: cachedPage,
        };
      }
    }

    logger.warn('⏰ Lock wait TIMEOUT');
    throw new Error('Timeout waiting for scraping to complete');
  }

  /**
   * Perform actual scraping
   */
  private async performScraping(query: string, page: number, limit: number): Promise<SearchResult> {
    logger.info(`🚀 Starting live scraping: page ${page}, limit ${limit}`);

    const platform = platformFactory.createScraper('copart');
    const scrapeUrl = `https://www.copart.com/lotSearchResults/?free=true&query=${encodeURIComponent(query)}`;

    const scrapeStart = Date.now();
    const vehicles = await platform.scrape(scrapeUrl, limit, undefined, page, limit);
    const scrapeDuration = Math.round((Date.now() - scrapeStart) / 1000);

    if (vehicles && vehicles.length > 0) {
      await BatchRepository.savePage(query, page, limit, vehicles, scrapeDuration);
      logger.info(`✅ Scraping SUCCESS: ${vehicles.length} vehicles in ${scrapeDuration}s`);

      // Save to L1 Redis Cache
      cacheService.cacheSearchResults(query, page, limit, vehicles).catch(e => logger.error('L1 Save Error:', e));

      // ⭐ CRITICAL OPTIMIZATION: Sync Search Results -> Individual Vehicle Collection
      // This ensures that when user clicks a vehicle, the data is already in 'copart_vehicles'
      // and can be fetched instantly by VehicleController
      (async () => {
        try {
          logger.info(`💾 Syncing ${vehicles.length} vehicles to 'copart_vehicles' collection...`);
          const upsertPromises = vehicles.map(v => VehicleRepository.upsertVehicle(v));
          await Promise.all(upsertPromises); // Parallel execution
          logger.info(`✨ Sync complete! Detailed views are now optimiazed.`);
        } catch (err) {
          logger.error('❌ Failed to sync vehicles to details collection:', err);
        }
      })();

      // Trigger prefetch in background
      this.triggerPrefetch(query, page, limit);

      return {
        success: true,
        source: 'live',
        cached: false,
        query,
        page,
        limit,
        returned: vehicles.length,
        vehicles,
        scrapeDurationSeconds: scrapeDuration,
      };
    }

    logger.warn('⚠️ Scraping returned 0 vehicles');
    throw new Error('No vehicles found');
  }

  /**
   * Trigger prefetch of next page in background
   */
  private async triggerPrefetch(
    query: string,
    currentPage: number,
    limitNum: number,
  ): Promise<void> {
    const nextPage = currentPage + 1;

    // Checking if prefetch needed for next page

    try {
      const existingPage = await BatchRepository.getPage(query, nextPage, limitNum);

      if (existingPage && existingPage.length > 0) {
        logger.info(`✅ Page ${nextPage} already cached, no prefetch needed`);
        return;
      }

      if (scrapingLockService.isLocked(query, nextPage, limitNum)) {
        logger.info(`🔒 Page ${nextPage} already being scraped`);
        return;
      }

      logger.info(`⚡ Prefetch triggered: page ${nextPage}, limit ${limitNum}`);

      // Execute in background (non-blocking)
      (async () => {
        const prefetchLockId = scrapingLockService.acquireLock(query, nextPage, limitNum);

        if (!prefetchLockId) {
          logger.info(`🔒 Could not acquire prefetch lock`);
          return;
        }

        try {
          const platform = platformFactory.createScraper('copart');
          const scrapeUrl = `https://www.copart.com/lotSearchResults/?free=true&query=${encodeURIComponent(query)}`;

          const scrapeStart = Date.now();
          const vehicles = await platform.scrape(
            scrapeUrl,
            limitNum,
            undefined,
            nextPage,
            limitNum,
          );
          const scrapeDuration = Math.round((Date.now() - scrapeStart) / 1000);

          if (vehicles && vehicles.length > 0) {
            await BatchRepository.savePage(query, nextPage, limitNum, vehicles, scrapeDuration);

            // ⭐ Sync Prefetched data too!
            const upsertPromises = vehicles.map(v => VehicleRepository.upsertVehicle(v));
            Promise.all(upsertPromises).catch(e => logger.error('Prefetch sync error:', e));

            // Cache in Redis L1
            cacheService.cacheSearchResults(query, nextPage, limitNum, vehicles).catch(() => { });

            logger.info(
              `✅ Prefetch SUCCESS: Page ${nextPage} (${vehicles.length} vehicles, ${scrapeDuration}s)`,
            );
          }
        } catch (error) {
          logger.error(`❌ Prefetch error:`, error);
        } finally {
          scrapingLockService.releaseLock(query, nextPage, limitNum, prefetchLockId);
        }
      })();
    } catch (error) {
      logger.error('Prefetch check error:', error);
    }
  }
}
