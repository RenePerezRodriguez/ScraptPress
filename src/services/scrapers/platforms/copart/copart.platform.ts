/**
 * Copart Platform Implementation - REFACTORED (Search API Strategy)
 * Clean orchestrator following Single Responsibility Principle
 */

import { Page } from 'playwright';
import {
  VehicleData,
  OptimizedVehicle,
  LogCallback,
} from '../../../../types/vehicle.types';
import { VehicleTransformer } from './transformers/vehicle.transformer';
import { LotNumbersExtractor } from './extractors/lot-numbers.extractor';
import { BasePlatform, PlatformConfig } from '../../platforms/base.platform';
import { Logger } from '../../../../config/logger';
import { BrowserManager } from './services/browser-manager.service';
import { AntiDetectionService } from './services/anti-detection.service';
import { CopartBlockDetector } from './services/block-detector.service';
import { ApiInterceptor } from './services/api-interceptor.service';
import { NavigationService } from './services/navigation.service';
import { RetryOrchestrator } from './services/retry-orchestrator.service';

const logger = Logger.getInstance();

export class CopartPlatform extends BasePlatform {
  private browserManager: BrowserManager;
  private antiDetection: AntiDetectionService;
  private blockDetector: CopartBlockDetector;
  private apiInterceptor: ApiInterceptor;
  private navigationService: NavigationService;
  private retryOrchestrator: RetryOrchestrator;


  private page: Page | null = null;

  constructor(config?: Partial<PlatformConfig>) {
    const defaultConfig: PlatformConfig = {
      name: 'Copart',
      baseUrl: 'https://www.copart.com',
      timeout: 0,
      retries: 3,
      ...config,
    };
    super(defaultConfig);

    this.browserManager = new BrowserManager();
    this.antiDetection = new AntiDetectionService();
    this.blockDetector = new CopartBlockDetector();
    this.apiInterceptor = new ApiInterceptor();
    this.navigationService = new NavigationService();
    this.retryOrchestrator = new RetryOrchestrator();
  }

  // ============= Validation Methods =============

  isValidUrl(url: string): boolean {
    return url.includes('copart.com');
  }

  parseSearchUrl(url: string): {
    query: string;
    page: number;
    sort: string;
    isSingleLot: boolean;
    lotNumber: string;
  } {
    const urlObj = new URL(url);
    const isSingleLot = urlObj.pathname.startsWith('/lot/');

    let lotNumber = '';
    if (isSingleLot) {
      const pathParts = urlObj.pathname.split('/');
      lotNumber = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];
    }

    return {
      query: urlObj.searchParams.get('query') || '',
      page: parseInt(urlObj.searchParams.get('page') || '1'),
      sort: urlObj.searchParams.get('sort') || 'default',
      isSingleLot,
      lotNumber,
    };
  }

  // ============= Main Scrape Method =============

  async scrape(
    url: string,
    maxItems?: number,
    onLog?: LogCallback,
    page?: number,
    count?: number,
  ): Promise<OptimizedVehicle[]> {
    this.onLog = onLog;
    const finalMaxItems = maxItems || 15;
    const finalPage = page || 1;
    const itemsPerPage = count || finalMaxItems;

    const result = await this.retryOrchestrator.executeWithRetry(
      async () => {
        await this.initialize();

        if (!this.page) {
          throw new Error('Failed to initialize browser');
        }

        const parsed = this.parseSearchUrl(url);
        const results: VehicleData[] = [];

        try {
          if (parsed.isSingleLot) {
            const v = await this.scrapeSingleLot(parsed.lotNumber);
            if (v) results.push(v);
          } else {
            await this.scrapeSearch(url, itemsPerPage, finalPage, results);
          }
        } finally {
          await this.cleanup();
        }

        const optimizedResults = results.map((vehicle) =>
          VehicleTransformer.optimizeForUi(vehicle),
        );

        return optimizedResults.slice(0, itemsPerPage);
      },
      {
        maxAttempts: this.config.retries || 3,
        initialDelay: 2000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        onRetry: async (attempt, error) => {
          logger.warn(`🔄 Retry ${attempt} after error: ${error}`);
          await this.cleanup();
        },
      },
    );

    if (!result.success) {
      throw result.error || new Error('Scraping failed after all retries');
    }

    return result.data!;
  }

  // ============= Initialization =============

  private async initialize(): Promise<void> {
    const { page } = await this.browserManager.initialize({
      headless: this.config.headless,
      debug: this.config.debug,
    });

    this.page = page;

    await this.antiDetection.applyAntiDetection(page);
    await this.apiInterceptor.setupInterception(page);

    logger.info('✅ Browser initialized successfully');
  }

  private async cleanup(): Promise<void> {
    await this.browserManager.close();
    this.page = null;
    this.apiInterceptor.clear();
  }

  // ============= Single Lot Scraping (Search API Strategy) =============

  private async scrapeSingleLot(lotNumber: string): Promise<VehicleData | null> {
    // 1. Check if we already captured it (e.g. from a Search Page interception)
    const cached = this.apiInterceptor.getVehicleData(lotNumber);
    if (cached) {
      logger.info(`⚡ [${lotNumber}] Cache HIT! Returning instant data.`);
      return VehicleTransformer.transformFromApi(cached as any);
    }

    // Only fetch if strictly necessary (creates NEW context safely)
    logger.info(`🔄 [${lotNumber}] Fetching via Search API...`);
    const lotStartTime = Date.now();
    const context = await this.browserManager.getContext();
    if (!context) return null; // Should not happen

    const lotPage = await context.newPage();

    try {
      await this.antiDetection.applyAntiDetection(lotPage);
      await this.apiInterceptor.setupInterception(lotPage);

      // "The Search Trick": Search by lot number returns full details JSON
      const searchUrl = `https://www.copart.com/lotSearchResults/?free=true&query=${lotNumber}`;
      logger.debug(`📍 [${lotNumber}] Navigating to: ${searchUrl}`);

      await lotPage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Poll for data (API usually returns within 1-2s)
      let apiData = null;
      for (let i = 0; i < 20; i++) {
        apiData = this.apiInterceptor.getVehicleData(lotNumber);
        if (apiData) break;
        await lotPage.waitForTimeout(500);
      }

      if (!apiData) {
        logger.error(`❌ [${lotNumber}] Failed to capture Search API data after 10s`);
        return null;
      }

      logger.info(`✅ [${lotNumber}] Captured Data! Transformed in ${((Date.now() - lotStartTime) / 1000).toFixed(1)}s`);
      return VehicleTransformer.transformFromApi(apiData as any);

    } catch (e) {
      logger.error(`❌ [${lotNumber}] Error:`, e);
      return null;
    } finally {
      await lotPage.close();
    }
  }

  // ============= Search Scraping =============

  private async scrapeSearch(
    url: string,
    itemsPerPage: number,
    startPage: number,
    results: VehicleData[],
  ): Promise<void> {
    if (!this.page) return;

    logger.info(`🚀 SEARCH STRATEGY: Extract IDs from DOM -> Fast API Lookup`);

    const searchUrl = new URL(url);
    searchUrl.searchParams.set('page', String(startPage));

    logger.info(`📄 Navigating to search page ${startPage}...`);
    await this.navigationService.navigateTo(this.page, searchUrl.toString());

    const blockResult = await this.blockDetector.isBlocked(this.page);
    if (blockResult.isBlocked) {
      throw new Error(`Blocked by Copart (${blockResult.blockType})`);
    }

    await this.navigationService.setModernViewPageSize(this.page, itemsPerPage);

    if (startPage > 1) {
      logger.info(`📄 Navigating to page ${startPage} in paginator...`);
      await this.navigationService.navigateToPage(this.page, startPage);
      await this.navigationService.waitForPageLoad(this.page);
    }

    // Extract Lot Numbers
    logger.info(`🔍 Extracting lot numbers...`);
    const lotNumbers = await LotNumbersExtractor.extractFromSearchPage(this.page);

    if (lotNumbers.length === 0) {
      logger.error('❌ No lot numbers found on search page');
      return;
    }

    const lotsToScrape = lotNumbers.slice(0, itemsPerPage);
    logger.info(`📦 Will process ${lotsToScrape.length} lots`);

    // Process parallel batches
    const BATCH_SIZE = 3;
    const totalBatches = Math.ceil(lotsToScrape.length / BATCH_SIZE);

    for (let i = 0; i < lotsToScrape.length; i += BATCH_SIZE) {
      const batch = lotsToScrape.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      logger.info(`\n📦 === BATCH ${batchNum}/${totalBatches} === Processing lots: ${batch.join(', ')}`);

      const batchPromises = batch.map((lotNumber, index) => {
        return new Promise<VehicleData | null>((resolve) => {
          const delay = index * (500 + Math.random() * 1000);
          setTimeout(async () => {
            const result = await this.scrapeSingleLot(lotNumber);
            resolve(result);
          }, delay);
        });
      });

      const batchResults = await Promise.all(batchPromises);
      const validResults = batchResults.filter((v): v is VehicleData => v !== null);
      results.push(...validResults);

      logger.info(
        `✅ Batch ${batchNum} complete: ${validResults.length}/${batch.length} successful`,
      );
    }
  }
}
