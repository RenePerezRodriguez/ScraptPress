/**
 * Lot Numbers Extractor - DOM-based (FAST)
 * 
 * Extracts only lot numbers from search results page using pure DOM scraping
 * NO AI needed - saves ~25-30 seconds per search
 */

import { Page } from 'playwright';
import { Logger } from '../../../../../config/logger';

const logger = Logger.getInstance();

export class LotNumbersExtractor {
    /**
     * Extract ONLY lot numbers from search results page (DOM - SUPER FAST)
     * This replaces the slow AI extraction for the search list
     * 
     * @param page Playwright page showing search results
     * @returns Array of 8-digit lot numbers found on the page
     */
    static async extractFromSearchPage(page: Page): Promise<string[]> {
        const startTime = Date.now();
        logger.info('🔍 Extracting lot numbers from DOM (no AI)...');

        try {
            const lotNumbers = await page.evaluate(() => {
                const results: string[] = [];

                // STRATEGY 1: Find links to /lot/{number}
                const lotLinks = document.querySelectorAll('a[href*="/lot/"]');
                lotLinks.forEach((link) => {
                    const href = link.getAttribute('href');
                    const match = href?.match(/\/lot\/(\d{8})/);
                    if (match && match[1]) {
                        results.push(match[1]);
                    }
                });

                // STRATEGY 2: Find data-lot attributes
                const dataLotElements = document.querySelectorAll('[data-lot]');
                dataLotElements.forEach((el) => {
                    const lot = el.getAttribute('data-lot');
                    if (lot && /^\d{8}$/.test(lot)) {
                        results.push(lot);
                    }
                });

                // STRATEGY 3: Find in visible text (backup - less reliable)
                // Only use if strategies 1 & 2 found nothing
                if (results.length === 0) {
                    const bodyText = document.body.innerText;
                    const matches = bodyText.match(/\b\d{8}\b/g);
                    if (matches) {
                        // Filter only those that look like lot numbers (not other 8-digit numbers)
                        matches.forEach((match) => {
                            // Lot numbers typically start with 9 or 8
                            if (match.startsWith('9') || match.startsWith('8')) {
                                results.push(match);
                            }
                        });
                    }
                }

                // Return unique lot numbers
                return [...new Set(results)];
            });

            const duration = Date.now() - startTime;
            logger.info(`✅ Found ${lotNumbers.length} lot numbers in ${duration}ms (DOM extraction)`);

            if (lotNumbers.length === 0) {
                logger.warn('⚠️ No lot numbers found - page might not have loaded correctly');
            }

            return lotNumbers.slice(0, 50); // Max 50 per page
        } catch (error) {
            logger.error('❌ Failed to extract lot numbers from DOM:', error);
            return [];
        }
    }

    /**
     * Validate that extracted lot numbers are in correct format
     */
    static validateLotNumbers(lotNumbers: string[]): boolean {
        if (lotNumbers.length === 0) return false;

        const validFormat = lotNumbers.every((lot) => /^\d{8}$/.test(lot));

        if (!validFormat) {
            logger.warn('⚠️ Some lot numbers have invalid format');
            return false;
        }

        logger.info(`✅ All ${lotNumbers.length} lot numbers validated`);
        return true;
    }
}
