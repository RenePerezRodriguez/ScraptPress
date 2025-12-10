/**
 * Platform Factory
 * Manages creation of scrapers for different platforms
 * This is where you'll add new platforms like IAAI, ManheimAuctions, etc
 */

import { BasePlatform, PlatformConfig } from './base.platform';
import { CopartPlatform } from './copart/copart.platform';
import { OptimizedVehicle, LogCallback } from '../../../types/vehicle.types';

export type PlatformType = 'copart' | 'iaai' | 'mannheim' | 'copart-direct';

export interface PlatformFactory {
  createScraper(type: PlatformType, config?: Partial<PlatformConfig>): BasePlatform;
  isSupportedPlatform(url: string): boolean;
  detectPlatform(url: string): PlatformType | null;
  listSupportedPlatforms(): PlatformType[];
}

export class DefaultPlatformFactory implements PlatformFactory {
  private platforms: Map<PlatformType, { config: PlatformConfig; factory: () => BasePlatform }> =
    new Map();

  constructor() {
    this.registerDefaultPlatforms();
  }

  /**
   * Register default platforms
   */
  private registerDefaultPlatforms(): void {
    // Copart
    this.platforms.set('copart', {
      config: {
        name: 'Copart',
        baseUrl: 'https://www.copart.com',
      },
      factory: () => new CopartPlatform(),
    });

    // Placeholder for IAAI
    // this.platforms.set('iaai', {
    //   config: {
    //     name: 'IAAI',
    //     baseUrl: 'https://www.iaai.com'
    //   },
    //   factory: () => new IaaiPlatform()
    // });

    // Placeholder for Mannheim
    // this.platforms.set('mannheim', {
    //   config: {
    //     name: 'Mannheim',
    //     baseUrl: 'https://www.manheim.com'
    //   },
    //   factory: () => new MannheimPlatform()
    // });
  }

  /**
   * Create a scraper for a specific platform
   */
  createScraper(type: PlatformType, config?: Partial<PlatformConfig>): BasePlatform {
    const platform = this.platforms.get(type);

    if (!platform) {
      throw new Error(
        `Platform '${type}' not supported. Available: ${Array.from(this.platforms.keys()).join(', ')}`,
      );
    }

    // Merge default config with custom config
    const mergedConfig = {
      ...platform.config,
      ...config,
    };

    // Create instance with merged config
    if (type === 'copart') {
      return new CopartPlatform(mergedConfig);
    }

    // Fallback to factory method
    const scraper = platform.factory();
    return scraper;
  }

  /**
   * Check if a URL belongs to a supported platform
   */
  isSupportedPlatform(url: string): boolean {
    return this.detectPlatform(url) !== null;
  }

  /**
   * Detect which platform a URL belongs to
   */
  detectPlatform(url: string): PlatformType | null {
    const lowerUrl = url.toLowerCase();

    if (lowerUrl.includes('copart.com')) {
      return 'copart';
    }

    // if (lowerUrl.includes('iaai.com')) {
    //   return 'iaai';
    // }

    // if (lowerUrl.includes('manheim.com')) {
    //   return 'mannheim';
    // }

    return null;
  }

  /**
   * List all supported platforms
   */
  listSupportedPlatforms(): PlatformType[] {
    return Array.from(this.platforms.keys());
  }

  /**
   * Register a custom platform (for future expansion)
   */
  registerPlatform(type: PlatformType, factory: () => BasePlatform, config: PlatformConfig): void {
    this.platforms.set(type, { factory, config });
  }
}

/**
 * Convenient singleton instance
 */
export const platformFactory = new DefaultPlatformFactory();

/**
 * Convenience function to scrape from any platform
 */
export async function scrapeFromUrl(
  url: string,
  maxItems?: number,
  onLog?: LogCallback,
  page?: number,
  count?: number,
): Promise<OptimizedVehicle[]> {
  const platformType = platformFactory.detectPlatform(url);

  if (!platformType) {
    throw new Error(`URL does not match any supported platform: ${url}`);
  }

  const scraper = platformFactory.createScraper(platformType);
  return scraper.scrape(url, maxItems, onLog, page, count);
}
