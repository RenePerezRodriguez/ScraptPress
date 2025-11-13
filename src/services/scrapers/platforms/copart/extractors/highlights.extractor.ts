/**
 * Highlights Extractor for Copart - Extracts vehicle features and highlights
 */

import { Page } from 'playwright';
import { Logger } from '../../../../../config/logger';

const logger = Logger.getInstance();

export class HighlightsExtractor {
  /**
   * Extract highlights/features from a lot page
   */
  static async extractFromLotPage(page: Page): Promise<string[]> {
    try {
      const highlights = await page.evaluate(() => {
        const highlightsList: string[] = [];

        // Look for features/highlights sections
        const sections = document.querySelectorAll(
          '[class*="highlights"], [class*="features"], [class*="equipment"],' +
            '[data-test*="highlight"], [data-test*="feature"]'
        );

        sections.forEach((section) => {
          const items = section.querySelectorAll('li, .feature-item, [class*="item"]');
          items.forEach((item) => {
            const text = item.textContent?.trim();
            // Filter out navigation/menu items and very long text
            if (
              text &&
              text.length > 5 &&
              text.length < 100 &&
              !text.toLowerCase().includes('sign in') &&
              !text.toLowerCase().includes('register') &&
              !text.toLowerCase().includes('menu')
            ) {
              highlightsList.push(text);
            }
          });
        });

        // Remove duplicates and limit to 10
        return [...new Set(highlightsList)].slice(0, 10);
      });

      return highlights;
    } catch (error) {
      logger.error('Error extracting highlights:', error);
      return [];
    }
  }
}
