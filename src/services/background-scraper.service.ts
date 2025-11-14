/**
 * Background Scraper Service
 * Automatically scrapes additional batches after initial response
 * to populate cache for future requests
 */

import { Logger } from '../config/logger';
import { platformFactory } from './scrapers/platforms/platform.factory';
import { BatchRepository } from './repositories/batch.repository';
import { VehicleRepository } from './repositories/vehicle.repository';
import { CacheService } from './cache.service';
import { CopartConfig } from '../config/copart.config';

const cache = CacheService.getInstance();

const logger = Logger.getInstance();

interface ScrapingJob {
  query: string;
  startBatch: number;
  totalBatchesTarget: number;
  backendBatchSize: number;
}

class BackgroundScraperService {
  private activeJobs: Map<string, boolean> = new Map();
  private readonly MAX_BACKGROUND_BATCHES = 4; // Scrapear hasta 4 batches (200 vehículos)

  /**
   * Start background scraping for a query
   * This will scrape batches 1, 2, 3 after batch 0 is returned to user
   */
  async startBackgroundScraping(
    query: string,
    initialBatchNumber: number = 0,
    backendBatchSize: number = 50
  ): Promise<void> {
    const jobKey = `${query.toLowerCase()}_from_${initialBatchNumber}`;

    // Don't start if already running
    if (this.activeJobs.get(jobKey)) {
      logger.debug(`Background scraping already running for: ${jobKey}`);
      return;
    }

    // Mark as active
    this.activeJobs.set(jobKey, true);

    // Start in background (non-blocking)
    this.scrapeAdditionalBatches({
      query,
      startBatch: initialBatchNumber + 1, // Start from next batch
      totalBatchesTarget: this.MAX_BACKGROUND_BATCHES,
      backendBatchSize
    })
      .catch((err) => {
        logger.error(`Background scraping error for ${query}:`, err);
      })
      .finally(() => {
        this.activeJobs.delete(jobKey);
      });

    logger.info(`🔄 Started background scraping for "${query}" (batches ${initialBatchNumber + 1} to ${this.MAX_BACKGROUND_BATCHES - 1})`);
  }

  /**
   * Scrape multiple batches in one go
   * Uses Copart's ability to return multiple items from page 0
   */
  private async scrapeAdditionalBatches(job: ScrapingJob): Promise<void> {
    const { query, startBatch, totalBatchesTarget, backendBatchSize } = job;

    try {
      // Calculate how many vehicles we need total
      const totalVehiclesNeeded = totalBatchesTarget * backendBatchSize; // e.g., 4 * 50 = 200

      logger.info(`📦 Background: Scraping ${totalVehiclesNeeded} vehicles for "${query}" (batches ${startBatch} to ${totalBatchesTarget - 1})`);

      const searchUrl = `https://www.copart.com/lotSearchResults/?free=true&query=${encodeURIComponent(query)}`;
      const platform = platformFactory.createScraper('copart');

      const scrapeStart = Date.now();

      // STRATEGY: Scrape from page 0 but request MANY items (e.g., 200)
      // Copart will return them all in one response if available
      const allVehicles = await platform.scrape(
        searchUrl,
        totalVehiclesNeeded, // Request 200 vehicles
        undefined,
        1, // Start from page 1 (which is actually page 0 in Copart)
        totalVehiclesNeeded // Page size
      );

      const scrapeDuration = (Date.now() - scrapeStart) / 1000;

      if (!allVehicles || allVehicles.length === 0) {
        logger.warn(`⚠️ Background scraping returned 0 vehicles for "${query}"`);
        return;
      }

      logger.info(`✅ Background scraped ${allVehicles.length} vehicles in ${scrapeDuration}s`);

      // Now split into batches and save each one
      const batchPromises: Promise<void>[] = [];

      for (let batchNum = startBatch; batchNum < totalBatchesTarget; batchNum++) {
        const batchStartIndex = batchNum * backendBatchSize;
        const batchEndIndex = batchStartIndex + backendBatchSize;

        // Extract this batch's vehicles
        const batchVehicles = allVehicles.slice(batchStartIndex, batchEndIndex);

        if (batchVehicles.length === 0) {
          // No more vehicles available
          logger.info(`📊 Batch ${batchNum} empty, stopping background scraping for "${query}"`);
          break;
        }

        // Save this batch in parallel
        batchPromises.push(this.saveBatch(query, batchNum, batchVehicles, scrapeDuration, backendBatchSize));
      }

      // Wait for all batches to be saved
      await Promise.all(batchPromises);

      logger.info(`✅ Background scraping complete for "${query}": saved ${batchPromises.length} additional batches`);

    } catch (error) {
      logger.error(`Background scraping failed for "${query}":`, error);
      throw error;
    }
  }

  /**
   * Save a single batch to all storage layers
   */
  private async saveBatch(
    query: string,
    batchNumber: number,
    vehicles: any[],
    scrapeDuration: number,
    backendBatchSize: number
  ): Promise<void> {
    const cacheKey = `search:${query.toLowerCase()}:batch:${batchNumber}:size:${backendBatchSize}`;

    try {
      // 1. Save to Redis (L1)
      await cache.set(cacheKey, { vehicles }, 3600);
      logger.debug(`💾 Redis: Saved batch ${batchNumber} (${vehicles.length} vehicles)`);

      // 2. Save to Firestore optimized structure (L2)
      await BatchRepository.saveBatch(query, batchNumber, vehicles, scrapeDuration);
      logger.debug(`💾 Firestore: Saved batch ${batchNumber} (${vehicles.length} vehicles)`);

      // 3. Save to legacy collection (backwards compatibility)
      const batchStartItem = batchNumber * backendBatchSize;
      await Promise.all(
        vehicles.map((v: any, index: number) => {
          const vehicleWithIndex = {
            ...v,
            scraped_index: batchStartItem + index,
            scraped_batch: batchNumber,
            scraped_query: query
          };
          return VehicleRepository.upsertVehicle(vehicleWithIndex);
        })
      );

      logger.info(`✅ Background: Batch ${batchNumber} saved (${vehicles.length} vehicles)`);
    } catch (error) {
      logger.error(`Error saving background batch ${batchNumber}:`, error);
      throw error;
    }
  }

  /**
   * Check if background scraping is active for a query
   */
  isScrapingActive(query: string, fromBatch: number = 0): boolean {
    const jobKey = `${query.toLowerCase()}_from_${fromBatch}`;
    return this.activeJobs.get(jobKey) || false;
  }

  /**
   * Get active jobs count
   */
  getActiveJobsCount(): number {
    return this.activeJobs.size;
  }

  /**
   * Clear all active jobs (for cleanup/restart)
   */
  clearAllJobs(): void {
    this.activeJobs.clear();
  }
}

// Singleton instance
export const backgroundScraperService = new BackgroundScraperService();
