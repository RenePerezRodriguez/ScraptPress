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
import { CopartConfig } from '../../../../config/copart.config';

const logger = Logger.getInstance();

export class CopartPlatform extends BasePlatform {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private context: BrowserContext | null = null;
  private apiResponses: Map<string, CopartSearchResponse> = new Map();
  private vehicleApiData: Map<string, any> = new Map();
  private currentExpectedPage: number = -1;
  private videoUrls: Map<string, string> = new Map();

  constructor(config?: Partial<PlatformConfig>) {
    const defaultConfig: PlatformConfig = {
      name: 'Copart',
      baseUrl: 'https://www.copart.com',
      timeout: 0,
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

  /**
   * Check if page shows Copart Error 15 (Access Denied by Imperva)
   */
  private async isCopartBlocked(): Promise<boolean> {
    if (!this.page) return false;
    
    try {
      const content = await this.page.content();
      
      // Detectar página de bloqueo de Imperva
      const hasError15 = content.includes('Error 15') && content.includes('Access denied');
      const hasImperva = content.includes('Powered by') && content.includes('Imperva');
      const hasBlockedMessage = content.includes('This request was blocked by our security service');
      
      if (hasError15 || (hasImperva && hasBlockedMessage)) {
        // Extraer IP si está disponible para logs
        const ipMatch = content.match(/Your IP:\s*<\/span>\s*<span class="value">([0-9.]+)<\/span>/);
        const yourIp = ipMatch ? ipMatch[1] : 'unknown';
        
        logger.warn(`🚫 COPART BLOCKED - Error 15 detected! Your IP: ${yourIp}`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Error checking if blocked:', error);
      return false;
    }
  }

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
        '--disable-background-timer-throttling',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials',
        '--window-size=1920,1080'
      ]
    });

    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      permissions: ['geolocation'],
      hasTouch: false,
      isMobile: false,
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
      }
    });

    this.page = await this.context.newPage();
    
    // Enhanced anti-detection measures
    await this.page.addInitScript(() => {
      // Remove webdriver property
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
      
      // Add chrome object
      (window as any).chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {}
      };
      
      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });
      
      // Languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en']
      });
      
      // Platform
      Object.defineProperty(navigator, 'platform', {
        get: () => 'Win32'
      });
      
      // Hardware concurrency
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 8
      });
      
      // Device memory
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8
      });
      
      // Permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: any) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: 'denied' } as PermissionStatus) :
          originalQuery(parameters)
      );
    });
    
    this.page.setDefaultTimeout(this.config.timeout || 0);
    this.page.setDefaultNavigationTimeout(this.config.timeout || 0);

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

    // Intercept video requests (.mp4 files)
    await pageToSetup.on('request', async (request) => {
      const url = request.url();
      if (url.includes('copart.com') && url.endsWith('.mp4')) {
        // Extract lot number from URL context or page
        const match = url.match(/\/([a-f0-9]{32})_O\.mp4/);
        if (match) {
          const videoHash = match[1];
          logger.debug(`🎬 Intercepted video request: ${url}`);
          // Store video URL by hash for later matching
          this.videoUrls.set(videoHash, url);
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
                // USE THE CURRENT EXPECTED PAGE instead of trying to extract from URL
                // Copart's API URLs don't reliably contain page numbers
                const pageNumber = this.currentExpectedPage;
                
                const itemCount = data.data?.results?.content?.length || data.data?.content?.length || data.data?.length || data.length || 0;
                
                // Store with page number as key to capture multiple responses
                const responseKey = pageNumber >= 0 ? `search_page_${pageNumber}` : 'search';
                this.apiResponses.set(responseKey, data);
                
                logger.debug(`✅ Intercepted ${itemCount} vehicles from API (assigned to expected page: ${pageNumber})`);
                logger.debug(`📍 Stored as key: "${responseKey}"`);
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
        // In classic view, we can get up to 100 items per page
        // We'll switch to classic view and set page size automatically
        const pageSize = CopartConfig.getValidPageSize(itemsPerPage);
        const pagesNeeded = CopartConfig.calculatePagesNeeded(itemsPerPage, pageSize);
        
        logger.info(`📄 Requesting ${itemsPerPage} items, need ${pagesNeeded} page(s) (${pageSize} items each in classic view)`);

        for (let i = 0; i < pagesNeeded; i++) {
          // Copart uses 1-indexed pages (page=1, page=2, page=3...)
          // page parameter from API already represents the correct Copart page
          const currentPage = page + i;
          const url_to_scrape = new URL(url);
          
          url_to_scrape.searchParams.set('page', String(currentPage));
          url_to_scrape.searchParams.set('size', String(pageSize));
          
          logger.debug(`🔍 Scraping Copart page ${currentPage} (${i + 1}/${pagesNeeded})`);
          
          await this.scrapeSearch(url_to_scrape.toString(), pageSize, results, currentPage);
          
          // Stop if we have enough results
          if (results.length >= itemsPerPage) {
            logger.debug(`✅ Got enough results: ${results.length}/${itemsPerPage}`);
            break;
          }
        }
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

    logger.debug(`Scraping complete. Requested: ${itemsPerPage}, Got: ${optimizedResults.length}`);
    return optimizedResults.slice(0, itemsPerPage);
  }

  // ============= Single Lot Scraping =============

  private async scrapeSingleLot(lotNumber: string, results: VehicleData[]): Promise<void> {
    if (!this.page) return;

    this.log('info', `Scraping single lot: ${lotNumber}`);
    this.apiResponses.clear();

    const lotUrl = `${this.config.baseUrl}/lot/${lotNumber}`;
    await this.page.goto(lotUrl, { waitUntil: 'domcontentloaded', timeout: 300000 }).catch(() => {});
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

  /**
   * Set page size in Modern View (PrimeNG)
   * Uses the p-dropdown component for rows per page
   */
  private async setModernViewPageSize(pageSize: number): Promise<void> {
    if (!this.page) return;
    
    try {
      // Simulate human behavior - random mouse movements
      await this.page.mouse.move(Math.random() * 500 + 100, Math.random() * 500 + 100);
      await this.page.waitForTimeout(Math.random() * 1000 + 1500);
      
      // Scroll like a human
      await this.page.evaluate(() => {
        window.scrollTo({
          top: Math.random() * 300,
          behavior: 'smooth'
        });
      });
      await this.page.waitForTimeout(Math.random() * 800 + 500);
      
      // Check if there's a reCAPTCHA
      const hasCaptcha = await this.page.$('iframe[src*="recaptcha"]').catch(() => null);
      if (hasCaptcha) {
        logger.warn('🚨 reCAPTCHA detected! Waiting 30 seconds for manual resolution...');
        await this.page.waitForTimeout(30000);
        logger.info('✅ Captcha wait complete, continuing...');
      }
      
      logger.info(`📏 Setting page size to ${pageSize} in Modern View (PrimeNG)...`);
      
      // PrimeNG dropdown selectors for rows per page
      const dropdownSelectors = [
        'p-dropdown.p-paginator-rpp-options',
        '.p-paginator-rpp-options.p-dropdown',
        '.p-paginator-bottom p-dropdown'
      ];
      
      for (let attempt = 1; attempt <= 3; attempt++) {
        logger.debug(`Attempt ${attempt}/3 to find page size dropdown`);
        
        for (const selector of dropdownSelectors) {
          try {
            const dropdown = await this.page.$(selector);
            if (dropdown) {
              logger.info(`✅ Found page size dropdown with selector: ${selector}`);
              
              // Click to open dropdown
              await dropdown.click();
              await this.page.waitForTimeout(1000);
              
              // Click on the option with desired page size
              // Options are usually 10, 20, 50, 100
              const optionSelectors = [
                `p-dropdownitem:has-text("${pageSize}")`,
                `.p-dropdown-item:has-text("${pageSize}")`,
                `li[aria-label="${pageSize}"]`
              ];
              
              for (const optionSelector of optionSelectors) {
                try {
                  const option = await this.page.$(optionSelector);
                  if (option) {
                    await option.click();
                    logger.info(`✅ Selected page size: ${pageSize}`);
                    await this.page.waitForTimeout(3000); // Wait for page reload
                    return;
                  }
                } catch (e) {
                  continue;
                }
              }
            }
          } catch (e) {
            logger.debug(`Selector ${selector} failed:`, e);
            continue;
          }
        }
        
        // Wait before next attempt
        if (attempt < 3) {
          logger.debug(`Waiting 2 seconds before attempt ${attempt + 1}...`);
          await this.page.waitForTimeout(2000);
        }
      }
      
      logger.warn('⚠️ Could not set page size - will work with default (likely 20)');
    } catch (error) {
      logger.warn(`⚠️ Error setting page size to ${pageSize} - continuing with defaults:`, error);
    }
  }

  /**
   * Navigate to a specific page using PrimeNG pagination
   * Strategy: Click on page number button or next/prev buttons
   */
  private async navigateToModernPage(targetPage: number): Promise<void> {
    if (!this.page || targetPage <= 1) return;
    
    logger.info(`📄 Navigating to page ${targetPage} using PrimeNG pagination...`);
    
    try {
      // Wait for pagination to be ready
      await this.page.waitForTimeout(2000);
      
      // STRATEGY 1: Click directly on the page number button if visible
      // PrimeNG uses: <button class="p-paginator-page" aria-label="X">
      const pageButtonSelectors = [
        `button.p-paginator-page[aria-label="${targetPage}"]`,
        `.p-paginator-pages button:has-text("${targetPage}")`,
        `button.p-paginator-element[aria-label="${targetPage}"]`
      ];
      
      for (const selector of pageButtonSelectors) {
        try {
          const pageButton = await this.page.$(selector);
          if (pageButton) {
            logger.info(`✅ Strategy 1: Found page ${targetPage} button, clicking...`);
            await pageButton.click();
            await this.page.waitForTimeout(3000);
            return;
          }
        } catch (e) {
          continue;
        }
      }
      
      // STRATEGY 2: Use "Next" button multiple times
      logger.info(`Strategy 2: Page ${targetPage} not visible, using Next button...`);
      
      // Get current page
      const currentPageButton = await this.page.$('button.p-paginator-page.p-highlight');
      let currentPage = 1;
      if (currentPageButton) {
        const pageText = await this.page.evaluate((btn: any) => btn.textContent?.trim(), currentPageButton);
        currentPage = parseInt(pageText || '1');
      }
      
      logger.info(`Current page: ${currentPage}, target: ${targetPage}`);
      
      const clicksNeeded = targetPage - currentPage;
      if (clicksNeeded > 0) {
        const nextButtonSelector = 'button.p-paginator-next:not([disabled])';
        
        for (let i = 0; i < clicksNeeded; i++) {
          const nextButton = await this.page.$(nextButtonSelector);
          if (!nextButton) {
            logger.warn(`⚠️ Next button not found or disabled at iteration ${i + 1}`);
            break;
          }
          
          await nextButton.click();
          logger.debug(`📄 Clicked Next button (${i + 1}/${clicksNeeded})`);
          await this.page.waitForTimeout(2000);
        }
        
        logger.info(`✅ Strategy 2: Navigated using Next button`);
      }
      
    } catch (error) {
      logger.error(`❌ Error navigating to page ${targetPage}:`, error);
      throw error;
    }
  }

  private async scrapeSearch(url: string, maxItems: number, results: VehicleData[], expectedPageIndex?: number): Promise<void> {
    if (!this.page) return;

    // 🔄 RETRY LOGIC: Intenta hasta 3 veces si Copart bloquea
    const MAX_RETRIES = 3;
    const WAIT_TIMES = [2 * 60 * 1000, 5 * 60 * 1000, 10 * 60 * 1000]; // 2, 5, 10 minutos
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        logger.info(`🚀 Scraping attempt ${attempt}/${MAX_RETRIES}...`);
        
        // Intentar scraping
        await this.scrapeSearchInternal(url, maxItems, results, expectedPageIndex);
        
        // ✅ Verificar si obtuvimos datos
        if (results.length > 0) {
          logger.info(`✅ Scraping successful on attempt ${attempt}! Got ${results.length} vehicles`);
          return; // Éxito, salir
        }
        
        // ⚠️ No obtuvimos datos, verificar si estamos bloqueados
        const isBlocked = await this.isCopartBlocked();
        
        if (isBlocked && attempt < MAX_RETRIES) {
          const waitTime = WAIT_TIMES[attempt - 1];
          const waitMinutes = Math.round(waitTime / 60000);
          
          logger.warn(`🚫 Copart Error 15 detected on attempt ${attempt}/${MAX_RETRIES}`);
          logger.warn(`⏳ Waiting ${waitMinutes} minutes before retry ${attempt + 1}...`);
          
          await this.page.waitForTimeout(waitTime);
          
          // Recargar página para nuevo intento
          logger.info(`🔄 Retrying after ${waitMinutes} minute wait...`);
          continue;
        }
        
        // Si no estamos bloqueados pero no hay datos, algo más está mal
        if (!isBlocked) {
          logger.warn(`⚠️ No data scraped but not blocked (attempt ${attempt}/${MAX_RETRIES})`);
          
          if (attempt < MAX_RETRIES) {
            logger.info(`⏳ Waiting 30 seconds before retry...`);
            await this.page.waitForTimeout(30000);
            continue;
          }
        }
        
        // Último intento sin datos
        if (attempt === MAX_RETRIES) {
          logger.error(`❌ All ${MAX_RETRIES} attempts failed. No vehicles scraped.`);
          return;
        }
        
      } catch (error) {
        logger.error(`❌ Error on scraping attempt ${attempt}/${MAX_RETRIES}:`, error);
        
        if (attempt < MAX_RETRIES) {
          const waitTime = 30000; // 30 segundos en caso de error
          logger.info(`⏳ Waiting 30 seconds before retry due to error...`);
          await this.page.waitForTimeout(waitTime);
          continue;
        } else {
          throw error; // Re-lanzar en último intento
        }
      }
    }
  }

  /**
   * Internal scraping method (sin retry logic)
   */
  private async scrapeSearchInternal(url: string, maxItems: number, results: VehicleData[], expectedPageIndex?: number): Promise<void> {
    if (!this.page) return;

    // NUEVA ESTRATEGIA: No incluir ?page en la URL inicial
    // 1. Navegar a la URL base sin parámetro page
    // 2. Cambiar a vista clásica
    // 3. Configurar tamaño de página
    // 4. LUEGO navegar a la página específica con botón "Siguiente"
    
    const urlObj = new URL(url);
    const targetPage = parseInt(urlObj.searchParams.get('page') || '1');
    
    // Remove page parameter from initial navigation
    urlObj.searchParams.delete('page');
    const baseUrl = urlObj.toString();
    
    this.log('info', `Navigating to base URL (will navigate to page ${targetPage} after setup): ${baseUrl}`);
    
    // Set expected page
    this.currentExpectedPage = targetPage;
    logger.debug(`🎯 Target page: ${targetPage}`);
    
    this.apiResponses.clear();
    this.vehicleApiData.clear();

    // Navigate to BASE URL with random delay to appear more human
    await this.page.waitForTimeout(Math.random() * 2000 + 1000);
    await this.page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 0 }).catch(() => {});
    
    // ✅ DETECCIÓN TEMPRANA DE BLOQUEO
    const blockedAfterNav = await this.isCopartBlocked();
    if (blockedAfterNav) {
      logger.warn(`🚫 Detected Error 15 immediately after navigation`);
      return; // Salir para que el retry maneje
    }
    
    // Wait for network idle with human-like delay
    await this.page.waitForTimeout(Math.random() * 1500 + 2000);
    
    // Random mouse movement on page
    await this.page.mouse.move(Math.random() * 800 + 200, Math.random() * 600 + 100);
    
    // Check for captcha before proceeding
    const hasCaptcha = await this.page.$('iframe[src*="recaptcha"]').catch(() => null);
    if (hasCaptcha) {
      logger.warn('🚨 reCAPTCHA detected on search page! Waiting 30 seconds...');
      await this.page.waitForTimeout(30000);
    }
    
    // Step 1: Set page size using Modern View (PrimeNG)
    await this.setModernViewPageSize(maxItems);
    
    // Step 2: Navigate to target page if needed (using PrimeNG pagination)
    if (targetPage > 1) {
      logger.info(`📄 Now navigating from page 1 to page ${targetPage}...`);
      await this.navigateToModernPage(targetPage);
    }
    
    // Wait for API response with the correct page data
    logger.debug(`Waiting for search API response (expecting page ${expectedPageIndex ?? 0})...`);
    const maxWaitTime = 20000;  // Increased to 20 seconds
    const pollInterval = 500;
    let elapsedTime = 0;
    
    // Look for the response with the correct page number
    const targetKey = expectedPageIndex !== undefined ? `search_page_${expectedPageIndex}` : 'search';
    
    while (elapsedTime < maxWaitTime) {
      // Check if we have the response for the expected page
      if (this.apiResponses.has(targetKey)) {
        logger.debug(`✅ Found response for page ${expectedPageIndex}`);
        break;
      }
      // Fallback: if we have ANY search response after 10 seconds, use it
      if (elapsedTime > 10000 && this.apiResponses.has('search')) {
        logger.warn(`⚠️ Using fallback search response (expected page ${expectedPageIndex})`);
        break;
      }
      await this.page.waitForTimeout(pollInterval);
      elapsedTime += pollInterval;
    }
    
    // Try to get the response for the expected page first, fallback to any search response
    const apiData = this.apiResponses.get(targetKey) || this.apiResponses.get('search');
    
    if (apiData?.data?.results?.content) {
      const content = apiData.data.results.content;
      const results_metadata = apiData.data.results;
      
      // Log complete metadata for debugging pagination
      logger.debug(`📊 API Response Metadata (full):`, JSON.stringify(results_metadata, null, 2));
      logger.debug(`📊 API Response - Known fields:`, {
        totalElements: results_metadata.totalElements,
        contentLength: content.length
      });
      
      content.forEach((item: any) => {
        const lotNumber = item.lotNumberStr || item.lot_number || item.ln;
        if (lotNumber) {
          this.vehicleApiData.set(lotNumber.toString(), item);
        }
      });
      
      // Try to extract video URLs from DOM for each vehicle
      if (this.page) {
        try {
          const videoUrls = await this.page.evaluate(() => {
            const videos: { [key: string]: string } = {};
            const videoElements = document.querySelectorAll('video source[src*=".mp4"]');
            videoElements.forEach((source) => {
              const src = source.getAttribute('src');
              if (src) {
                // Extract hash from video URL
                const match = src.match(/\/([a-f0-9]{32})_O\.mp4/);
                if (match) {
                  videos[match[1]] = src;
                }
              }
            });
            return videos;
          });
          
          // Store video URLs
          Object.entries(videoUrls).forEach(([hash, url]) => {
            this.videoUrls.set(hash, url);
            logger.debug(`🎬 Found video in DOM: ${url}`);
          });
        } catch (e) {
          logger.debug('Could not extract videos from DOM');
        }
      }
      
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
              timeout: 0 // No timeout - wait as long as needed
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
