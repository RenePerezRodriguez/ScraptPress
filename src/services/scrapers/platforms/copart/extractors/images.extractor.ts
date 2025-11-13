/**
 * Images Extractor for Copart - Extracts vehicle images in multiple resolutions
 */

import { Page } from 'playwright';
import { ImageGalleryItem } from '../../../../../types/vehicle.types';
import { Logger } from '../../../../../config/logger';

const logger = Logger.getInstance();

export class ImagesExtractor {
  /**
   * Extract images and video from a lot page
   */
  static async extractFromLotPage(page: Page): Promise<{
    images_gallery: ImageGalleryItem[];
    engine_video: string;
  }> {
    try {
      const extracted = await page.evaluate(() => {
        const images: ImageGalleryItem[] = [];

        // Look for image gallery containers
        const gallerySelectors = [
          '[class*="gallery"]',
          '[class*="image-viewer"]',
          '[class*="lotdetail-img"]',
          '[data-test*="image"]'
        ];

        for (const selector of gallerySelectors) {
          const containers = document.querySelectorAll(selector);
          const imgs = Array.from(document.querySelectorAll('img'));

          imgs.forEach((img) => {
            const src = img.src || img.getAttribute('data-src') || '';

            // Filter out logos, icons, and site assets
            if (
              src.includes('/lpp/') &&
              src.includes('copart.com') &&
              !src.includes('logo') &&
              !src.includes('icon') &&
              !src.includes('/content/')
            ) {
              // Extract base URL without suffix
              const baseMatch = src.match(/(https:\/\/.*?)(_\w+\.jpg)/);
              if (baseMatch) {
                const baseUrl = baseMatch[1];
                if (!images.find((i) => i.thumbnail?.includes(baseUrl))) {
                  images.push({
                    thumbnail: baseUrl + '_thb.jpg',
                    full: baseUrl + '_ful.jpg',
                    high_res: baseUrl + '_hrs.jpg'
                  });
                }
              }
            }
          });

          if (images.length > 0) break;
        }

        // Try to find engine video
        let engine_video = 'N/A';
        const videoElement = document.querySelector('video source');
        if (videoElement) {
          engine_video = videoElement.getAttribute('src') || 'N/A';
        }

        return {
          images_gallery: images.slice(0, 15), // Max 15 images
          engine_video
        };
      });

      return extracted;
    } catch (error) {
      logger.error('Error extracting images:', error);
      return { images_gallery: [], engine_video: 'N/A' };
    }
  }
}
