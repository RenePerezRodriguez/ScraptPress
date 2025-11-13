/**
 * Copart Platform Implementation
 * Extends BasePlatform to handle Copart-specific scraping logic
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import {
  VehicleData,
  OptimizedVehicle,
  LogCallback,
  ParsedUrl,
  CopartSearchResponse,
  ExtendedVehicleData
} from '../../../../types/vehicle.types';
import { VinExtractor } from './extractors/vin.extractor';
import { ImagesExtractor } from './extractors/images.extractor';
import { HighlightsExtractor } from './extractors/highlights.extractor';
import { VehicleTransformer } from './transformers/vehicle.transformer';
import { extractAllDetails } from './extractors/details.extractor';
import { BasePlatform, PlatformConfig } from '../../platforms/base.platform';
import { Logger } from '../../../../config/logger';

const logger = Logger.getInstance();

export class CopartPlatform extends BasePlatform {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private context: BrowserContext | null = null;
  private apiResponses: Map<string, CopartSearchResponse> = new Map();
  private vehicleApiData: Map<string, any> = new Map();

  constructor(config?: Partial<PlatformConfig>) {
    const defaultConfig: PlatformConfig = {
      name: 'Copart',
      baseUrl: 'https://www.copart.com',
      timeout: 60000,
      retries: 3,
      ...config
    };
    super(defaultConfig);
  }

  // ============= Validation Methods =============

  isValidUrl(url: string): boolean {
    return url.includes('copart.com');
  }

  parseSearchUrl(url: string): Record<string, any> {
    const urlObj = new URL(url);
    const isSingleLot = urlObj.pathname.startsWith('/lot/');
    
    // Extract lot number from URL like /lot/12345678
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
      lotNumber
    };
  }

  // ============= Initialization =============

  private async initialize(): Promise<void> {
    const isContainer = !!process.env.K_SERVICE || process.env.NODE_ENV === 'production';
    const headlessEnv = process.env.HEADLESS;
    const useHeadless = headlessEnv ? headlessEnv !== 'false' : isContainer;

    this.browser = await chromium.launch({
      headless: useHeadless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-setuid-sandbox',
        '--disable-background-networking',
        '--disable-background-timer-throttling'
      ]
    });

    this.context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      permissions: ['geolocation'],
      hasTouch: false,
      isMobile: false
    });

    this.page = await this.context.newPage();
    
    // Anti-detection measures
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
      
      (window as any).chrome = {
        runtime: {}
      };
      
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });
      
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en']
      });
    });
    
    this.page.setDefaultTimeout(this.config.timeout || 60000);
    this.page.setDefaultNavigationTimeout(this.config.timeout || 60000);

    await this.setupApiInterceptor();
  }

  // ============= API Interceptor =============

  private async setupApiInterceptor(targetPage?: Page): Promise<void> {
    const pageToSetup = targetPage || this.page;
    if (!pageToSetup) return;

    const requestPayloads = new Map<string, any>();

    await pageToSetup.on('request', (request) => {
      const url = request.url();
      
      if (url.includes('/lotdetails/solr/lot-images')) {
        try {
          const postData = request.postDataJSON();
          if (postData && postData.lotNumber) {
            requestPayloads.set(url, postData.lotNumber);
            logger.debug(`Solr Request - Lot: ${postData.lotNumber}`);
          }
        } catch (e) {
          // Ignore
        }
      }
    });

    await pageToSetup.on('response', async (response) => {
      try {
        const url = response.url();
        const status = response.status();
        const contentType = response.headers()['content-type'] || '';

        if (url.includes('copart.com') && status === 200 && 
            !url.includes('.css') && !url.includes('.png') && !url.includes('.jpg') && 
            !url.includes('.woff') && !url.includes('.svg')) {
          
          try {
            const text = await response.text();
            if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
              const data = JSON.parse(text);
              
              const hasVehicleData = data.data?.results?.content || data.data?.content || 
                                    (Array.isArray(data.data) && data.data.length > 0 && data.data[0]?.lotNumberStr) ||
                                    (Array.isArray(data) && data.length > 0 && data[0]?.lotNumberStr);
              
              if (hasVehicleData) {
                this.apiResponses.set('search', data);
                const itemCount = data.data?.results?.content?.length || data.data?.content?.length || data.data?.length || data.length || 0;
                logger.debug(`Intercepted ${itemCount} vehicles from API`);
              }
            }
          } catch (e) {
            // No JSON
          }
        }
        
        if (url.includes('/lotdetails/vehicledetails') && response.status() === 200) {
          try {
            const data = await response.json();
            const lotData = data.data?.lotDetails || data.data;
            const lotNumber = lotData?.ln || lotData?.lotNumberStr;
            
            if (lotNumber) {
              logger.debug(`Intercepted lot details for ${lotNumber}`);
              this.vehicleApiData.set(lotNumber.toString(), lotData);
            }
          } catch (e) {
            // Ignore
          }
        }
        
        if (url.includes('/lotdetails/solr/lot-images') && response.status() === 200) {
          try {
            const json = await response.json();
            const lotNumber = requestPayloads.get(url);
            
            if (json.data && json.data.imagesList && json.data.imagesList.IMAGE) {
              const images = json.data.imagesList.IMAGE;
              
              if (lotNumber && images.length > 0) {
                logger.debug(`Storing ${images.length} images for lot ${lotNumber}`);
                
                const existingData = this.vehicleApiData.get(lotNumber.toString()) || {};
                existingData.solrImages = images;
                
                if (json.data.videoList && json.data.videoList.VIDEO) {
                  const videos = Array.isArray(json.data.videoList.VIDEO) 
                    ? json.data.videoList.VIDEO 
                    : [json.data.videoList.VIDEO];
                  
                  const engineVideo = videos.find((v: any) => 
                    v.videoTypeDescription?.toLowerCase().includes('engine') ||
                    v.videoType === 'ENGINE'
                  );
                  
                  if (engineVideo && (engineVideo.url || engineVideo.videoUrl)) {
                    existingData.engine_video = engineVideo.url || engineVideo.videoUrl;
                    logger.debug(`Found engine video for lot ${lotNumber}`);
                  }
                }
                
                this.vehicleApiData.set(lotNumber.toString(), existingData);
                requestPayloads.delete(url);
              }
            }
          } catch (e) {
            // Ignore
          }
        }
      } catch (error) {
        // Silently ignore
      }
    });
  }

  // ============= Main Scrape Method =============

  async scrape(
    url: string,
    maxItems: number = 15,
    onLog?: LogCallback,
    page: number = 1,
    count?: number
  ): Promise<OptimizedVehicle[]> {
    this.onLog = onLog;
    await this.initialize();

    if (!this.page || !this.browser) {
      throw new Error('Scraper not initialized');
    }

    const parsed = this.parseSearchUrl(url);
    const results: VehicleData[] = [];
    const itemsPerPage = count || maxItems;

    try {
      if (parsed.isSingleLot) {
        await this.scrapeSingleLot(parsed.query, results);
      } else {
        const url_to_scrape = new URL(url);
        
        if (page === 2) {
          url_to_scrape.searchParams.set('sort', 'price');
        } else if (page === 3) {
          url_to_scrape.searchParams.set('sort', 'mileage');
        } else if (page >= 4) {
          url_to_scrape.searchParams.set('sort', 'year');
        }
        
        await this.scrapeSearch(url_to_scrape.toString(), itemsPerPage, results);
      }

      await this.enrichWithVins(results);
    } catch (error) {
      this.log('error', String(error));
    } finally {
      try {
        await this.browser.close();
      } catch (e) {
        // Ignore
      }
      this.log('info', 'Browser closed');
    }

    const optimizedResults = results.map((vehicle) =>
      VehicleTransformer.optimizeForUi(vehicle)
    );

    logger.debug(`Scraping complete. Page: ${page}, Items: ${optimizedResults.length}`);
    return optimizedResults.slice(0, itemsPerPage);
  }

  // ============= Single Lot Scraping =============

  private async scrapeSingleLot(lotNumber: string, results: VehicleData[]): Promise<void> {
    if (!this.page) return;

    this.log('info', `Scraping single lot: ${lotNumber}`);
    this.apiResponses.clear();

    const lotUrl = `${this.config.baseUrl}/lot/${lotNumber}`;
    await this.page.goto(lotUrl, { waitUntil: 'domcontentloaded', timeout: this.config.timeout }).catch(() => {});
    await this.page.waitForTimeout(500);

    const lotData = this.apiResponses.get('lot-details');
    if (lotData?.data?.lotDetails) {
      results.push(VehicleTransformer.transformFromApi(lotData.data.lotDetails as any));
      return;
    }

    const vehicleData = await this.scrapeVehicleFromDom();
    if (vehicleData && vehicleData.lot_number !== 'N/A') {
      results.push(vehicleData);
    }
  }

  // ============= Search Scraping =============

  private async scrapeSearch(url: string, maxItems: number, results: VehicleData[]): Promise<void> {
    if (!this.page) return;

    this.log('info', `Navigating to: ${url}`);
    this.apiResponses.clear();
    this.vehicleApiData.clear();

    await this.page.goto(url, { waitUntil: 'load', timeout: this.config.timeout }).catch(() => {});
    
    logger.debug('Waiting for search API response...');
    const maxWaitTime = 15000;
    const pollInterval = 500;
    let elapsedTime = 0;
    
    while (elapsedTime < maxWaitTime && !this.apiResponses.has('search')) {
      await this.page.waitForTimeout(pollInterval);
      elapsedTime += pollInterval;
    }
    
    const apiData = this.apiResponses.get('search');
    
    if (apiData?.data?.results?.content) {
      const content = apiData.data.results.content;
      
      content.forEach((item: any) => {
        const lotNumber = item.lotNumberStr || item.lot_number || item.ln;
        if (lotNumber) {
          this.vehicleApiData.set(lotNumber.toString(), item);
        }
      });
      
      results.push(...content.map((item: any) => VehicleTransformer.transformFromApi(item)));
      logger.debug(`Got ${content.length} items from API`);
      return;
    }

    logger.warn('No API interception, trying fallback strategies');
    await this.tryFallbackStrategies(results, maxItems);
  }

  // ============= Fallback Strategies =============

  private async tryFallbackStrategies(results: VehicleData[], maxItems: number): Promise<void> {
    await this.tryInPageFetch(results);

    if (results.length === 0) {
      await this.tryDomScraping(results, maxItems);
    }
  }

  private async tryInPageFetch(results: VehicleData[]): Promise<void> {
    if (!this.page) return;

    try {
      logger.debug('🔍 Trying to extract data from page JavaScript...');
      
      const fetchedData = await this.page.evaluate(async (): Promise<any[] | null> => {
        const windowAny = window as any;
        
        if (windowAny.searchResults?.content) {
          return windowAny.searchResults.content;
        }
        if (windowAny.lotData?.results?.content) {
          return windowAny.lotData.results.content;
        }
        if (windowAny.__INITIAL_STATE__?.results) {
          return windowAny.__INITIAL_STATE__.results;
        }
        
        try {
          const query = new URLSearchParams(window.location.search).get('query');
          
          if (query) {
            const endpoints = [
              `/public/lots/search-results?query=${encodeURIComponent(query)}`,
              `/api/lots/search?query=${encodeURIComponent(query)}`,
              `/lotSearchResults?free=true&query=${encodeURIComponent(query)}`
            ];
            
            for (const endpoint of endpoints) {
              try {
                const response = await fetch(endpoint);
                if (response.ok) {
                  const data = await response.json();
                  if (data.data?.results?.content || data.data?.content) {
                    return data.data.results?.content || data.data.content;
                  }
                }
              } catch (e) {
                // Continue
              }
            }
          }
        } catch (e) {
          // Ignore
        }
        
        return null;
      });

      if (fetchedData && Array.isArray(fetchedData) && fetchedData.length > 0) {
        logger.debug(`✅ Extracted ${fetchedData.length} vehicles from page JavaScript`);
        results.push(...fetchedData.map((item: any) => VehicleTransformer.transformFromApi(item)));
        
        fetchedData.forEach((item: any) => {
          const lotNumber = item.lotNumberStr || item.lot_number || item.ln;
          if (lotNumber) {
            this.vehicleApiData.set(lotNumber.toString(), item);
          }
        });
      }
    } catch (error) {
      logger.warn('⚠️ In-page fetch failed:', error);
    }
  }

  private async tryDomScraping(results: VehicleData[], maxItems: number): Promise<void> {
    if (!this.page) return;

    logger.debug('Attempting DOM scraping...');

    const vehicles = await this.page.evaluate(() => {
      const vehiclesList: any[] = [];
      const selectors = [
        '[data-uname*="searchResultsLot"]',
        '[class*="vehicle-card"]',
        '[class*="lot-details"]'
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el) => {
          try {
            const lot_number = (el as any).getAttribute?.('data-lot-number') || '';
            if (lot_number) {
              vehiclesList.push({ lot_number });
            }
          } catch (e) {
            // Skip
          }
        });

        if (vehiclesList.length > 0) break;
      }

      return vehiclesList;
    });

    for (const vehicle of vehicles.slice(0, maxItems)) {
      results.push({
        lot_number: vehicle.lot_number,
        vin: 'N/A',
        year: 'N/A',
        make: 'N/A',
        vehicle_model: 'N/A',
        trim: 'N/A',
        sale_status: 'N/A',
        current_bid: 'N/A',
        buy_it_now_price: 'N/A',
        auction_date: 'N/A',
        location: 'N/A',
        location_city: 'N/A',
        location_state: 'N/A',
        location_country: 'N/A',
        odometer: 'N/A',
        odometer_status: 'N/A',
        primary_damage: 'N/A',
        secondary_damage: 'N/A',
        body_style: 'N/A',
        doors: 'N/A',
        color: 'N/A',
        interior_color: 'N/A',
        engine: 'N/A',
        cylinders: 'N/A',
        drive: 'N/A',
        transmission: 'N/A',
        fuel: 'N/A',
        doc_type: 'N/A',
        title_type: 'N/A',
        is_clean_title: 'No',
        has_keys: 'N/A',
        engine_condition: 'N/A',
        estimated_retail_value: 'N/A',
        imageUrl: 'N/A',
        images: [],
        images_gallery: [],
        engine_video: 'N/A',
        highlights: [],
        damage_details: [],
        copart_url: `https://www.copart.com/lot/${vehicle.lot_number}`
      });
    }
  }

  // ============= VIN Enrichment =============

  private async enrichWithVins(vehicles: VehicleData[]): Promise<void> {
    if (!this.page || !this.browser || !this.context) return;

    // Process ALL vehicles (changed from slice(0, 5))
    const vehiclesToProcess = vehicles;

    if (vehiclesToProcess.length === 0) return;

    logger.debug(`🔍 Extracting extended data for ${vehiclesToProcess.length} vehicles...`);
    this.log('info', `Extracting extended data for ${vehiclesToProcess.length} vehicles...`);

    // Parallel processing: Process 3 vehicles at a time
    const PARALLEL_LIMIT = 3;
    
    for (let i = 0; i < vehiclesToProcess.length; i += PARALLEL_LIMIT) {
      const chunk = vehiclesToProcess.slice(i, i + PARALLEL_LIMIT);
      const batchNum = Math.floor(i / PARALLEL_LIMIT) + 1;
      const totalBatches = Math.ceil(vehiclesToProcess.length / PARALLEL_LIMIT);
      
      logger.debug(`📦 Processing batch ${batchNum}/${totalBatches} (${chunk.length} vehicles)`);
      
      // Process vehicles in this batch in parallel
      await Promise.all(
        chunk.map(async (vehicle) => {
          if (!vehicle.lot_number || vehicle.lot_number === 'N/A') return;
          
          let dedicatedPage: Page | null = null;
          
          try {
            // Create dedicated page for this vehicle
            dedicatedPage = await this.context!.newPage();
            
            // Setup response interceptor for this page to capture images
            await this.setupApiInterceptor(dedicatedPage);
            
            const lotUrl = `${this.config.baseUrl}/lot/${vehicle.lot_number}`;
            logger.debug(`🌐 [${vehicle.lot_number}] Visiting lot page...`);
            
            await dedicatedPage.goto(lotUrl, { 
              waitUntil: 'domcontentloaded',
              timeout: 15000 
            });
            
            await dedicatedPage.waitForTimeout(500);
            
            // Extract VIN
            if (vehicle.vin === 'N/A' || !vehicle.vin || vehicle.vin.includes('*')) {
              const vin = await VinExtractor.extractFromLotPage(dedicatedPage, vehicle.lot_number);
              if (vin !== 'N/A' && !vin.includes('*')) {
                vehicle.vin = vin;
                logger.debug(`✅ [${vehicle.lot_number}] VIN = ${vin}`);
                this.log('info', `Lot ${vehicle.lot_number}: VIN = ${vin}`);
              }
            }

            // Extract additional data (images, highlights)
            const apiData = this.vehicleApiData.get(vehicle.lot_number);
            const additionalData = await this.extractAdditionalDataFromPage(dedicatedPage, vehicle, apiData);
            Object.assign(vehicle, additionalData);
            
            const imgCount = additionalData.images_gallery?.length || 0;
            const hlCount = additionalData.highlights?.length || 0;
            logger.debug(`✅ [${vehicle.lot_number}] Extended data: ${imgCount} images, ${hlCount} highlights, video: ${additionalData.engine_video}`);
          } catch (error) {
            logger.warn(`⚠️ [${vehicle.lot_number}] Error extracting data:`, error);
          } finally {
            // Always close the dedicated page
            if (dedicatedPage) {
              await dedicatedPage.close().catch(() => {});
            }
          }
        })
      );
      
      logger.debug(`✅ Batch ${batchNum}/${totalBatches} complete`);
    }

    this.log('info', 'Extended data extraction complete');
  }

  // ============= Additional Data Extraction (with dedicated page) =============

  private async extractAdditionalDataFromPage(page: Page, vehicle: VehicleData, apiData?: any): Promise<Partial<ExtendedVehicleData>> {
    try {
      const highlights = await HighlightsExtractor.extractFromLotPage(page);
      const extendedDetails = apiData ? extractAllDetails(apiData) : {};

      let images_gallery: any[] = [];
      let engine_video = 'N/A';
      
      // Try to get images from apiData first
      if (apiData) {
        if (apiData.solrImages && Array.isArray(apiData.solrImages) && apiData.solrImages.length > 0) {
          logger.debug(`   🖼️  Found ${apiData.solrImages.length} images in solrImages`);
          apiData.solrImages.forEach((img: any) => {
            if (img.thumbnailUrl || img.fullUrl) {
              const fullUrl = img.fullUrl || img.thumbnailUrl || '';
              const thumbnailUrl = img.thumbnailUrl || img.fullUrl || '';
              const highResUrl = fullUrl.replace('_ful.jpg', '_hrs.jpg').replace('_thb.jpg', '_hrs.jpg');
              
              images_gallery.push({
                thumbnail: thumbnailUrl,
                full: fullUrl,
                high_res: highResUrl
              });
            }
          });
        }
        else if (apiData.imagesList && Array.isArray(apiData.imagesList) && apiData.imagesList.length > 0) {
          logger.debug(`   🖼️  Found ${apiData.imagesList.length} images in imagesList`);
          apiData.imagesList.forEach((img: any) => {
            const imgUrl = img.url || img.link?.href || '';
            
            if (imgUrl && imgUrl.includes('/lpp/')) {
              const baseMatch = imgUrl.match(/(https:\/\/.*?\/lpp\/\d+\/[a-f0-9]+)/);
              if (baseMatch) {
                const baseUrl = baseMatch[1];
                images_gallery.push({
                  thumbnail: baseUrl + '_thb.jpg',
                  full: baseUrl + '_ful.jpg',
                  high_res: baseUrl + '_hrs.jpg'
                });
              }
            }
          });
        }

        if (apiData.engine_video && apiData.engine_video !== 'N/A') {
          engine_video = apiData.engine_video;
        } else if (apiData.hasVideo && apiData.videoUrl) {
          engine_video = apiData.videoUrl;
        }
      }

      // ALWAYS try to extract from DOM (even if apiData has images - DOM might have more)
      logger.debug(`   🔍 Extracting images from DOM...`);
      const extractedData = await ImagesExtractor.extractFromLotPage(page);
      
      if (extractedData && extractedData.images_gallery.length > 0) {
        logger.debug(`   ✅ Found ${extractedData.images_gallery.length} images in DOM`);
        // If we didn't get images from apiData, use DOM images
        if (images_gallery.length === 0) {
          images_gallery = extractedData.images_gallery;
        }
        // Update video if we didn't have it
        if (engine_video === 'N/A' && extractedData.engine_video !== 'N/A') {
          engine_video = extractedData.engine_video;
        }
      } else {
        logger.debug(`   ⚠️  No images found in DOM`);
      }

      logger.debug(`   📊 Final result: ${images_gallery.length} images, video: ${engine_video}`);

      return {
        images_gallery,
        engine_video,
        highlights,
        ...extendedDetails
      };
    } catch (error) {
      logger.error('Error extracting additional data:', error);
      return {};
    }
  }

  // ============= Additional Data Extraction (legacy) =============

  private async extractAdditionalData(vehicle: VehicleData, apiData?: any): Promise<Partial<ExtendedVehicleData>> {
    if (!this.page) return {};
    return this.extractAdditionalDataFromPage(this.page, vehicle, apiData);
  }

  // ============= DOM Scraping Fallback =============

  private async scrapeVehicleFromDom(): Promise<VehicleData | null> {
    if (!this.page) return null;

    const vehicleData = await this.page.evaluate(() => {
      const getText = (selector: string) =>
        document.querySelector(selector)?.textContent?.trim() || 'N/A';

      return {
        lot_number: getText('[class*="lot-number"]') || 'N/A',
        year: getText('[class*="year"]') || 'N/A',
        make: getText('[class*="make"]') || 'N/A',
        vehicle_model: getText('[class*="model"]') || 'N/A'
      };
    });

    if (!vehicleData.lot_number || vehicleData.lot_number === 'N/A') {
      return null;
    }

    return {
      ...vehicleData,
      vin: 'N/A',
      trim: 'N/A',
      sale_status: 'N/A',
      current_bid: 'N/A',
      buy_it_now_price: 'N/A',
      auction_date: 'N/A',
      location: 'N/A',
      location_city: 'N/A',
      location_state: 'N/A',
      location_country: 'N/A',
      odometer: 'N/A',
      odometer_status: 'N/A',
      primary_damage: 'N/A',
      secondary_damage: 'N/A',
      body_style: 'N/A',
      doors: 'N/A',
      color: 'N/A',
      interior_color: 'N/A',
      engine: 'N/A',
      cylinders: 'N/A',
      drive: 'N/A',
      transmission: 'N/A',
      fuel: 'N/A',
      doc_type: 'N/A',
      title_type: 'N/A',
      is_clean_title: 'No',
      has_keys: 'N/A',
      engine_condition: 'N/A',
      estimated_retail_value: 'N/A',
      imageUrl: 'N/A',
      images: [],
      images_gallery: [],
      engine_video: 'N/A',
      highlights: [],
      damage_details: [],
      copart_url: `https://www.copart.com/lot/${vehicleData.lot_number}`
    };
  }
}
