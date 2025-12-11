/**
 * ApiInterceptor - Intercepts and captures API responses
 * Single Responsibility: Network request/response interception
 */

import { Page, Route } from 'playwright';
import { Logger } from '../../../../../config/logger';
import { CopartSearchResponse } from '../../../../../types/vehicle.types';

const logger = Logger.getInstance();

export interface VehicleApiData {
  lotNumberNumeric?: number;
  ln?: string;
  lotNumberStr?: string;
  [key: string]: unknown;
}

export class ApiInterceptor {
  private apiResponses: Map<string, CopartSearchResponse> = new Map();
  private vehicleApiData: Map<string, VehicleApiData> = new Map();
  private videoUrls: Map<string, string> = new Map();
  private currentExpectedPage: number = -1;

  /**
   * Setup API response interception
   */
  async setupInterception(page: Page): Promise<void> {
    // Intercept search API responses
    // Intercept search API responses (covers both standard search and single lot lookup)
    await page.route(/.*(publicListingSearch|search-results).*/, async (route: Route) => {
      const response = await route.fetch();

      try {
        const data = (await response.json()) as CopartSearchResponse;

        if (data?.data?.results?.content) {
          const content = data.data.results.content as any[];
          const results = data.data.results as any;
          const pageNum = results.pageNum || 1;

          // 1. Store full page response
          const key = `page_${pageNum}`;
          this.apiResponses.set(key, data);
          logger.info(`✅ Captured Search API page ${pageNum} (${content.length} vehicles)`);

          // 2. Store INDIVIDUAL vehicles (The "Magic" Trick)
          content.forEach(vehicle => {
            // Search API uses 'lotNumberStr'
            const ln = vehicle.lotNumberStr || vehicle.lotNumber;
            if (ln) {
              this.vehicleApiData.set(ln.toString(), vehicle as VehicleApiData);
            }
          });
          if (content.length > 0) {
            logger.info(`💾 Cached ${content.length} individual vehicles from search`);
          }
        }
      } catch (_jsonError) {
        logger.debug(`⚠️ Could not parse search API response`);
      }

      await route.fulfill({ response });
    });

    // Intercept individual vehicle details
    await page.route('**/lotdetails/**', async (route: Route) => {
      logger.info(`🎯 INTERCEPTED: ${route.request().url()}`);
      const response = await route.fetch();

      try {
        const data = (await response.json()) as {
          data?: { lotDetails?: { lotNumberNumeric?: number;[key: string]: unknown } };
        };

        logger.info(`📦 Response keys: ${JSON.stringify(Object.keys(data))}`);

        if (data?.data?.lotDetails?.lotNumberNumeric) {
          const lotNumber = data.data.lotDetails.lotNumberNumeric;
          this.vehicleApiData.set(lotNumber.toString(), data.data as VehicleApiData);
          logger.info(`✅ CAPTURED LOT ${lotNumber} - ${Object.keys(data.data.lotDetails).length} fields`);
        } else {
          logger.warn(`⚠️ No lotDetails.lotNumberNumeric found`);
        }
      } catch (jsonError) {
        logger.error(`❌ JSON parse error:`, jsonError);
      }

      await route.fulfill({ response });
    });

    // Intercept video URLs
    await page.route('**/*.mp4', async (route: Route) => {
      const url = route.request().url();
      const lotMatch = url.match(/\/(\d{8})\//);

      if (lotMatch) {
        const lotNumber = lotMatch[1];
        this.videoUrls.set(lotNumber, url);
        logger.debug(`🎥 Captured video URL for lot ${lotNumber}`);
      }

      await route.continue();
    });
  }

  /**
   * Get captured API response for page
   */
  getApiResponse(page: number): CopartSearchResponse | undefined {
    return this.apiResponses.get(`page_${page}`);
  }

  /**
   * Get all captured API responses
   */
  getAllApiResponses(): Map<string, CopartSearchResponse> {
    return this.apiResponses;
  }

  /**
   * Get vehicle API data
   */
  getVehicleData(lotNumber: string): VehicleApiData | undefined {
    return this.vehicleApiData.get(lotNumber);
  }

  /**
   * Get video URL for lot
   */
  getVideoUrl(lotNumber: string): string | undefined {
    return this.videoUrls.get(lotNumber);
  }

  /**
   * Set expected page for validation
   */
  setExpectedPage(page: number): void {
    this.currentExpectedPage = page;
  }

  /**
   * Get expected page
   */
  getExpectedPage(): number {
    return this.currentExpectedPage;
  }

  /**
   * Clear all captured data
   */
  clear(): void {
    this.apiResponses.clear();
    this.vehicleApiData.clear();
    this.videoUrls.clear();
    this.currentExpectedPage = -1;
  }

  /**
   * Get statistics about captured data
   */
  getStats() {
    return {
      apiResponses: this.apiResponses.size,
      vehicleData: this.vehicleApiData.size,
      videoUrls: this.videoUrls.size,
      expectedPage: this.currentExpectedPage,
    };
  }
}
