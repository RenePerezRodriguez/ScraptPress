/**
 * ScraptPress Worker Process
 * Dedicated process for processing scraping jobs from Redis Queue
 *
 * Deployment:
 * - Can be scaled independently from API
 * - Run: node dist/worker.js
 * - Set WORKER_CONCURRENCY env var to control parallel jobs
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { Logger } from './config/logger';
import type { WorkerHealthStats } from './types';
import JobQueueManager from './services/queue/job-queue';
import { platformFactory } from './services/scrapers/platforms/platform.factory';
import { BatchRepository } from './services/repositories/batch.repository';
import { Job } from 'bull';

const logger = Logger.getInstance();

// Worker configuration
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '3');
const WORKER_ID = process.env.WORKER_ID || `worker-${process.pid}`;

interface ScrapeJobData {
  batchId: string;
  query: string;
  page: number;
  limit: number;
  clientIp?: string;
  apiKey?: string;
  priority?: 'high' | 'normal' | 'low';
  [key: string]: unknown; // Make it compatible with JobData
}

class ScraptPressWorker {
  private queueManager: JobQueueManager;
  private isShuttingDown = false;

  constructor() {
    this.queueManager = JobQueueManager.getInstance();
  }

  /**
   * Start worker process
   */
  async start(): Promise<void> {
    logger.info(`🚀 Starting ScraptPress Worker: ${WORKER_ID}`);
    logger.info(`📊 Concurrency: ${WORKER_CONCURRENCY} parallel jobs`);

    // Setup graceful shutdown
    this.setupGracefulShutdown();

    // Initialize and process scraping queue
    await this.queueManager.processQueue<ScrapeJobData>(
      'SCRAPE_COPART',
      this.processScrapeJob.bind(this) as (job: Job<ScrapeJobData>) => Promise<unknown>,
      WORKER_CONCURRENCY,
    );

    logger.info('✅ Worker is ready to process jobs');
  }

  /**
   * Process a scraping job
   */
  private async processScrapeJob(job: Job<ScrapeJobData>): Promise<void> {
    const { batchId, query, page, limit, priority } = job.data;

    logger.info(
      `🔄 Processing job ${job.id}: batch=${batchId}, query="${query}", page=${page}, limit=${limit}, priority=${priority}, attempt=${job.attemptsMade + 1}`,
    );

    try {
      // Update status to processing
      await this.updateJobStatus(batchId, 'processing', {
        workerId: WORKER_ID,
        startedAt: new Date().toISOString(),
      });

      // Create scraper instance
      const platform = platformFactory.createScraper('copart', {
        headless: true,
        debug: false,
      });

      // Build search URL
      const scrapeUrl = `https://www.copart.com/lotSearchResults/?free=true&query=${encodeURIComponent(query)}`;

      // Perform scraping
      const scrapeStart = Date.now();
      const vehicles = await platform.scrape(scrapeUrl, limit, undefined, page, limit);
      const scrapeDuration = Math.round((Date.now() - scrapeStart) / 1000);

      logger.info(
        `✅ Job ${job.id} completed: batch=${batchId}, vehicles=${vehicles.length}, duration=${scrapeDuration}s`,
      );

      // Save results to Firestore
      if (vehicles && vehicles.length > 0) {
        await BatchRepository.savePage(query, page, limit, vehicles, scrapeDuration);
      }

      // Update status to completed
      await this.updateJobStatus(batchId, 'completed', {
        vehiclesFound: vehicles.length,
        scrapeDurationSeconds: scrapeDuration,
        completedAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      logger.error(`❌ Job ${job.id} failed:`, error);

      // Update status to failed
      await this.updateJobStatus(batchId, 'failed', {
        error: (error as Error).message,
        failedAt: new Date().toISOString(),
        attempt: job.attemptsMade + 1,
      });

      throw error; // Let Bull handle retries
    }
  }

  /**
   * Update job status in Firestore
   */
  private async updateJobStatus(
    batchId: string,
    status: 'queued' | 'processing' | 'completed' | 'failed',
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      await BatchRepository.updateJobStatus(batchId, status, metadata);
    } catch (error) {
      logger.error(`Failed to update job status for ${batchId}:`, error);
    }
  }

  /**
   * Setup graceful shutdown
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      logger.info(`⚠️ Received ${signal}, shutting down gracefully...`);

      try {
        await this.queueManager.closeAll();
        logger.info('✅ Worker shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  /**
   * Health check endpoint (for Kubernetes/Cloud Run)
   */
  async healthCheck(): Promise<{ healthy: boolean; stats: WorkerHealthStats['stats'] }> {
    try {
      const queueStats = await this.queueManager.getQueueStats('SCRAPE_COPART');
      return {
        healthy: true,
        stats: {
          workerId: WORKER_ID,
          totalJobs:
            (queueStats?.completed || 0) + (queueStats?.failed || 0) + (queueStats?.active || 0),
          completedJobs: queueStats?.completed || 0,
          failedJobs: queueStats?.failed || 0,
          activeJobs: queueStats?.active || 0,
          averageProcessingTime: 0,
          successRate: queueStats?.completed
            ? (queueStats.completed / (queueStats.completed + (queueStats.failed || 0))) * 100
            : 0,
          concurrency: WORKER_CONCURRENCY,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        stats: {
          totalJobs: 0,
          completedJobs: 0,
          failedJobs: 0,
          activeJobs: 0,
          averageProcessingTime: 0,
          successRate: 0,
          error: (error as Error).message,
        },
      };
    }
  }
}

// Start worker
const worker = new ScraptPressWorker();

worker.start().catch((error: unknown) => {
  logger.error('❌ Worker startup failed:', error as Error);
  process.exit(1);
});

// Export for testing
export default ScraptPressWorker;
