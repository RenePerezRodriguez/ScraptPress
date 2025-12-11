/**
 * AntiDetectionService - Injects anti-detection scripts
 * Single Responsibility: Browser automation detection prevention
 */

import { Page } from 'playwright';
import { Logger } from '../../../../../config/logger';

const logger = Logger.getInstance();

export class AntiDetectionService {
  /**
   * Apply comprehensive anti-detection measures to page
   */
  async applyAntiDetection(page: Page): Promise<void> {
    await page.addInitScript(() => {
      // Remove webdriver property
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Extend Window interface for custom properties
      interface CustomWindow extends Window {
        cdc_adoQpoasnfa76pfcZLmcfl_Array?: unknown;
        cdc_adoQpoasnfa76pfcZLmcfl_Promise?: unknown;
        cdc_adoQpoasnfa76pfcZLmcfl_Symbol?: unknown;
        chrome?: {
          runtime: Record<string, unknown>;
          loadTimes: () => void;
          csi: () => void;
          app: {
            isInstalled: boolean;
            InstallState: {
              DISABLED: string;
              INSTALLED: string;
              NOT_INSTALLED: string;
            };
            RunningState: {
              CANNOT_RUN: string;
              READY_TO_RUN: string;
              RUNNING: string;
            };
          };
        };
      }

      const win = window as unknown as CustomWindow;

      // Override automation indicators
      delete win.cdc_adoQpoasnfa76pfcZLmcfl_Array;
      delete win.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
      delete win.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;

      // Add chrome object with more properties
      win.chrome = {
        runtime: {},
        loadTimes: function () {},
        csi: function () {},
        app: {
          isInstalled: false,
          InstallState: {
            DISABLED: 'disabled',
            INSTALLED: 'installed',
            NOT_INSTALLED: 'not_installed',
          },
          RunningState: {
            CANNOT_RUN: 'cannot_run',
            READY_TO_RUN: 'ready_to_run',
            RUNNING: 'running',
          },
        },
      };

      // Mock plugins with realistic data
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          {
            0: { type: 'application/x-google-chrome-pdf' },
            description: 'Portable Document Format',
            filename: 'internal-pdf-viewer',
            length: 1,
            name: 'Chrome PDF Plugin',
          },
          {
            0: { type: 'application/pdf' },
            description: 'Portable Document Format',
            filename: 'internal-pdf-viewer',
            length: 1,
            name: 'Chrome PDF Viewer',
          },
        ],
      });

      // Languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      // Platform
      Object.defineProperty(navigator, 'platform', {
        get: () => 'Win32',
      });

      // Hardware concurrency
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 8,
      });

      // Device memory
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8,
      });

      // Max touch points
      Object.defineProperty(navigator, 'maxTouchPoints', {
        get: () => 0,
      });

      // Vendor
      Object.defineProperty(navigator, 'vendor', {
        get: () => 'Google Inc.',
      });

      // Mock WebGL
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (parameter) {
        if (parameter === 37445) {
          return 'Intel Inc.'; // UNMASKED_VENDOR_WEBGL
        }
        if (parameter === 37446) {
          return 'Intel Iris OpenGL Engine'; // UNMASKED_RENDERER_WEBGL
        }
        return getParameter.apply(this, [parameter]);
      };

      // Mock canvas fingerprinting
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (type?: string) {
        const context = this.getContext('2d');
        if (context) {
          // Add tiny random noise to prevent fingerprinting
          const imageData = context.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] = imageData.data[i] + Math.floor(Math.random() * 2);
          }
          context.putImageData(imageData, 0, 0);
        }
        return originalToDataURL.apply(this, [type]);
      };

      // Battery API - make it look like plugged in
      Object.defineProperty(navigator, 'getBattery', {
        value: () =>
          Promise.resolve({
            charging: true,
            chargingTime: 0,
            dischargingTime: Infinity,
            level: 1.0,
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => true,
          }),
      });

      // Connection API
      Object.defineProperty(navigator, 'connection', {
        get: () => ({
          effectiveType: '4g',
          downlink: 10,
          rtt: 50,
          saveData: false,
        }),
      });

      // Mock permissions API (simplified to avoid type issues)
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: PermissionDescriptor) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: 'granted' } as PermissionStatus)
          : originalQuery(parameters);
    });

    logger.debug('✅ Anti-detection measures applied');
  }

  /**
   * Simulate human-like behavior with random delays
   */
  async randomDelay(min: number = 100, max: number = 300): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Simulate human mouse movements
   */
  async simulateHumanMovement(page: Page): Promise<void> {
    const viewport = page.viewportSize();
    if (!viewport) return;

    const x = Math.floor(Math.random() * viewport.width);
    const y = Math.floor(Math.random() * viewport.height);

    await page.mouse.move(x, y, { steps: 10 });
    await this.randomDelay(50, 150);
  }
}
