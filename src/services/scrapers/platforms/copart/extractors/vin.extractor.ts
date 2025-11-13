/**
 * VIN Extractor for Copart - Extracts Vehicle Identification Number from lot pages
 */

import { Page } from 'playwright';
import { Logger } from '../../../../../config/logger';

const logger = Logger.getInstance();

export class VinExtractor {
  private static readonly VIN_PATTERN = /\b[A-HJ-NPR-Z0-9]{17}\b/i;

  /**
   * Extract VIN from a lot page
   */
  static async extractFromLotPage(page: Page, lotNumber: string): Promise<string> {
    try {
      const lotUrl = `https://www.copart.com/lot/${lotNumber}`;
      await page.goto(lotUrl, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
      
      // Wait for API calls to complete (give time for lotdetails API)
      await page.waitForTimeout(2000);

      const vin = await page.evaluate(() => {
        const pageText = document.body.innerText;
        const vinMatch = pageText.match(/\b[A-HJ-NPR-Z0-9]{17}\b/i);
        if (vinMatch) return vinMatch[0];

        // Fallback: try specific selectors
        const vinElement = document.querySelector('[data-uname="lotsearchLotdetailVinvalue"]');
        if (vinElement?.textContent) {
          const text = vinElement.textContent.trim();
          const match = text.match(/\b[A-HJ-NPR-Z0-9]{17}\b/i);
          if (match) return match[0];
        }

        return null;
      });

      return vin || 'N/A';
    } catch (error) {
      logger.error(`Error extracting VIN for lot ${lotNumber}:`, error);
      return 'N/A';
    }
  }

  /**
   * Validate VIN format
   */
  static isValidVin(vin: string): boolean {
    return this.VIN_PATTERN.test(vin);
  }
}
