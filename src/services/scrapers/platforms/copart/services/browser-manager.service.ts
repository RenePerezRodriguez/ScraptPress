/**
 * BrowserManager - Manages browser lifecycle and context
 * Single Responsibility: Browser initialization and cleanup
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { Logger } from '../../../../../config/logger';

const logger = Logger.getInstance();

export interface BrowserConfig {
  headless?: boolean;
  debug?: boolean;
}

export class BrowserManager {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private context: BrowserContext | null = null;

  async initialize(
    config: BrowserConfig = {},
  ): Promise<{ browser: Browser; page: Page; context: BrowserContext }> {
    const isContainer = !!process.env.K_SERVICE || process.env.NODE_ENV === 'production';
    const headlessEnv = process.env.HEADLESS;
    const useHeadless =
      config.headless !== undefined
        ? config.headless
        : headlessEnv
          ? headlessEnv !== 'false'
          : isContainer;

    if (config.debug) {
      logger.info(`🐛 Debug mode enabled: headless=${useHeadless}, container=${isContainer}`);
    }

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
        '--window-size=1920,1080',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-breakpad',
        '--disable-component-extensions-with-background-pages',
        '--disable-ipc-flooding-protection',
        '--enable-features=NetworkService,NetworkServiceInProcess',
        '--force-color-profile=srgb',
        '--hide-scrollbars',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-first-run',
        '--disable-notifications',
        '--disable-popup-blocking',
        '--start-maximized',
      ],
    });

    this.context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      permissions: ['geolocation'],
      hasTouch: false,
      isMobile: false,
      extraHTTPHeaders: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        DNT: '1',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
      },
    });

    this.page = await this.context.newPage();

    return {
      browser: this.browser,
      page: this.page,
      context: this.context,
    };
  }

  async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }

    if (this.context) {
      await this.context.close();
      this.context = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  getPage(): Page | null {
    return this.page;
  }

  getBrowser(): Browser | null {
    return this.browser;
  }

  getContext(): BrowserContext | null {
    return this.context;
  }
}
