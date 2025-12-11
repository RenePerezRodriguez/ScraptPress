/**
 * Base Platform Abstract Class
 * Defines the interface for all scraping platforms (Copart, IAAI, etc)
 *
 * This allows adding new platforms (IAAI, ManheimAuctions, etc) without
 * modifying core scraper logic
 */

import { OptimizedVehicle, LogCallback } from '../../../types/vehicle.types';

export interface PlatformConfig {
  name: string;
  baseUrl: string;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
  headless?: boolean; // false = ver el navegador (solo local)
  debug?: boolean; // true = logs detallados y screenshots
}

export interface ScrapingResult {
  platform: string;
  items: OptimizedVehicle[];
  totalResults: number;
  page: number;
  pageSize: number;
  timestamp: number;
}

export abstract class BasePlatform {
  protected config: PlatformConfig;
  protected onLog?: LogCallback;

  constructor(config: PlatformConfig) {
    this.config = config;
  }

  /**
   * Main scrape method - must be implemented by each platform
   * @param url - The search URL or query
   * @param maxItems - Maximum items to return
   * @param onLog - Logging callback
   * @param page - Page number for pagination
   * @param count - Items per page
   */
  abstract scrape(
    url: string,
    maxItems?: number,
    onLog?: LogCallback,
    page?: number,
    count?: number,
  ): Promise<OptimizedVehicle[]>;

  /**
   * Get platform details
   */
  getPlatformInfo(): PlatformConfig {
    return this.config;
  }

  /**
   * Common logging utility
   */
  protected log(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void {
    this.onLog?.({
      level,
      msg: `[${this.config.name}] ${message}`,
      ...(data ? { data } : {}),
    });
    console.log(`[${this.config.name}] ${message}`, data || '');
  }

  /**
   * Validate if a URL is valid for this platform
   */
  abstract isValidUrl(url: string): boolean;

  /**
   * Get search parameters from URL
   */
  abstract parseSearchUrl(url: string): Record<string, unknown>;
}
