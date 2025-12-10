/**
 * CopartBlockDetector - Detects Imperva Error 15 blocking
 * Single Responsibility: Block detection and IP extraction
 */

import { Page } from 'playwright';
import { Logger } from '../../../../../config/logger';

const logger = Logger.getInstance();

export interface BlockDetectionResult {
  isBlocked: boolean;
  yourIp?: string;
  blockType?: 'error15' | 'imperva' | 'unknown';
}

export class CopartBlockDetector {
  /**
   * Check if page shows Copart Error 15 (Access Denied by Imperva)
   */
  async isBlocked(page: Page): Promise<BlockDetectionResult> {
    try {
      const content = await page.content();

      // Detectar página de bloqueo de Imperva
      const hasError15 = content.includes('Error 15') && content.includes('Access denied');
      const hasImperva = content.includes('Powered by') && content.includes('Imperva');
      const hasBlockedMessage = content.includes(
        'This request was blocked by our security service',
      );

      if (hasError15 || (hasImperva && hasBlockedMessage)) {
        // Extraer IP si está disponible para logs
        const ipMatch = content.match(
          /Your IP:\s*<\/span>\s*<span class="value">([0-9.]+)<\/span>/,
        );
        const yourIp = ipMatch ? ipMatch[1] : 'unknown';

        const blockType = hasError15 ? 'error15' : 'imperva';
        logger.warn(`🚫 COPART BLOCKED - ${blockType} detected! Your IP: ${yourIp}`);

        return {
          isBlocked: true,
          yourIp,
          blockType,
        };
      }

      return {
        isBlocked: false,
      };
    } catch (error: unknown) {
      logger.error('Error checking if blocked:', error as Error);
      return {
        isBlocked: false,
      };
    }
  }

  /**
   * Check for rate limiting indicators
   */
  async isRateLimited(page: Page): Promise<boolean> {
    try {
      const content = await page.content();
      return (
        content.includes('rate limit') ||
        content.includes('too many requests') ||
        content.includes('429')
      );
    } catch {
      return false;
    }
  }
}
