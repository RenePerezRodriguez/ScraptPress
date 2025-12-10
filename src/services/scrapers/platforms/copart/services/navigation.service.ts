/**
 * NavigationService - Handles Copart navigation and page transitions
 * Single Responsibility: Page navigation and PrimeNG interactions
 */

import { Page } from 'playwright';
import { Logger } from '../../../../../config/logger';

const logger = Logger.getInstance();

export class NavigationService {
  /**
   * Navigate to URL with human-like behavior
   */
  async navigateTo(page: Page, url: string): Promise<void> {
    await this.humanDelay(500, 1000);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 }).catch(() => { });
    await this.humanDelay(1000, 2000);
    await this.simulateHumanMouseMovement(page);
    await this.humanDelay(500, 1000);
    await this.simulateHumanScroll(page);
    await this.humanDelay(500, 1000);
  }

  /**
   * Set page size in Modern View (PrimeNG)
   */
  async setModernViewPageSize(page: Page, pageSize: number): Promise<void> {
    try {
      // Simulate human behavior
      await page.mouse.move(Math.random() * 500 + 100, Math.random() * 500 + 100);
      await page.waitForTimeout(Math.random() * 500 + 800); // OPTIMIZED

      // Scroll like a human
      await page.evaluate(() => {
        window.scrollTo({
          top: Math.random() * 300,
          behavior: 'smooth',
        });
      });
      await page.waitForTimeout(Math.random() * 400 + 500); // OPTIMIZED

      // Try multiple selectors for the rows-per-page dropdown in paginator
      const dropdownSelectors = [
        '.p-paginator-rpp-options', // Specific paginator rows-per-page dropdown
        'p-dropdown.p-paginator-rpp-options', // With element tag
        '.p-paginator .p-dropdown', // Dropdown inside paginator
        'p-paginator p-dropdown', // PrimeNG paginator dropdown
      ];

      let dropdownFound = false;
      for (const selector of dropdownSelectors) {
        const dropdown = page.locator(selector).first();
        if ((await dropdown.count()) > 0) {
          try {
            await dropdown.click({ timeout: 5000 });
            dropdownFound = true;
            logger.info(`✅ Opened rows-per-page dropdown with selector: ${selector}`);
            await page.waitForTimeout(Math.random() * 300 + 300); // OPTIMIZED

            // Try to find and click the option in the overlay
            const optionSelectors = [
              `.p-dropdown-item:has-text("${pageSize}")`,
              `li[aria-label="${pageSize}"]`,
              `li:has-text("${pageSize}")`,
              `[role="option"]:has-text("${pageSize}")`,
            ];

            for (const optSelector of optionSelectors) {
              const option = page.locator(optSelector).first();
              if ((await option.count()) > 0) {
                await option.click({ timeout: 3000 });
                logger.info(`✅ Page size set to ${pageSize} in modern view`);
                await page.waitForTimeout(Math.random() * 500 + 1000); // OPTIMIZED
                return;
              }
            }
          } catch (_err) {
            logger.debug(`Selector ${selector} failed, trying next...`);
            continue;
          }
        }
      }

      if (!dropdownFound) {
        logger.warn('⚠️ Page size dropdown not found, continuing with default size (10)');
        return;
      }
    } catch (error: unknown) {
      logger.error(`❌ Failed to set page size in modern view: ${error}`);
      logger.warn('⚠️ Continuing without setting page size');
      // Don't throw, just log and continue
    }
  }

  /**
   * Switch to classic view with page size (DEPRECATED - Copart removed classic view)
   */
  async switchToClassicView(_page: Page, _pageSize: number): Promise<void> {
    logger.warn('⚠️ Classic view is no longer available on Copart, using modern view');
    // Don't throw error, just log warning
    return;
  }

  /**
   * Navigate to specific page in PrimeNG table
   */
  async navigateToPage(page: Page, pageNumber: number): Promise<void> {
    try {
      logger.debug(`📄 Navigating to page ${pageNumber} using PrimeNG paginator...`);

      await page.mouse.move(Math.random() * 500 + 100, Math.random() * 500 + 100);
      await page.waitForTimeout(Math.random() * 1000 + 1500);

      // Try clicking the page number button directly
      // PrimeNG buttons have aria-label with just the number, e.g., aria-label="2"
      const pageButtonSelector = `button.p-paginator-page[aria-label="${pageNumber}"]`;
      const targetButton = page.locator(pageButtonSelector);
      const buttonExists = (await targetButton.count()) > 0;

      if (buttonExists) {
        await targetButton.click();
        logger.info(`✅ Clicked page ${pageNumber} button in paginator`);
        await page.waitForTimeout(Math.random() * 2000 + 3000);
        return;
      }

      // Fallback: Try input field
      const inputSelector =
        'p-paginator input.p-paginator-page-input, p-paginator input[type="text"]';
      const inputExists = (await page.locator(inputSelector).count()) > 0;

      if (inputExists) {
        await page.fill(inputSelector, String(pageNumber));
        await page.keyboard.press('Enter');
        logger.info(`✅ Navigated using input field to page ${pageNumber}`);
        await page.waitForTimeout(Math.random() * 2000 + 3000);
        return;
      }

      logger.warn(`⚠️ Could not find navigation control for page ${pageNumber}`);
    } catch (error: unknown) {
      logger.error(`❌ Error navigating to page ${pageNumber}: ${error}`);
      throw error;
    }
  }

  /**
   * Wait for page to load
   */
  async waitForPageLoad(page: Page): Promise<void> {
    try {
      await page.waitForLoadState('networkidle', { timeout: 60000 });
    } catch (error: unknown) {
      logger.debug('⏱️ Network idle timeout, continuing...', error as Error);
    }
  }

  /**
   * Simulate human delay
   */
  private async humanDelay(min: number = 1000, max: number = 3000): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Simulate human mouse movements
   */
  private async simulateHumanMouseMovement(page: Page): Promise<void> {
    const numMoves = Math.floor(Math.random() * 3) + 2;
    for (let i = 0; i < numMoves; i++) {
      const x = Math.random() * 1000 + 100;
      const y = Math.random() * 600 + 100;
      await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 10) + 5 });
      await page.waitForTimeout(Math.random() * 500 + 200);
    }
  }

  /**
   * Simulate human scrolling
   */
  private async simulateHumanScroll(page: Page): Promise<void> {
    const scrollDistance = Math.random() * 500 + 300;
    await page.evaluate((distance) => {
      window.scrollTo({
        top: distance,
        behavior: 'smooth',
      });
    }, scrollDistance);
    await page.waitForTimeout(Math.random() * 1000 + 500);
  }
}
