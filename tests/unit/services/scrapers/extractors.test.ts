/**
 * Tests for Copart Extractors
 */

import { extractAllDetails } from '../../../../src/services/scrapers/platforms/copart/extractors/details.extractor';
import { VinExtractor } from '../../../../src/services/scrapers/platforms/copart/extractors/vin.extractor';
import { ImagesExtractor } from '../../../../src/services/scrapers/platforms/copart/extractors/images.extractor';
import { HighlightsExtractor } from '../../../../src/services/scrapers/platforms/copart/extractors/highlights.extractor';

// Mock Playwright Page
const createMockPage = (evaluateReturn: any) => ({
  evaluate: jest.fn().mockResolvedValue(evaluateReturn),
  goto: jest.fn().mockResolvedValue(undefined),
  waitForTimeout: jest.fn().mockResolvedValue(undefined),
  $: jest.fn(),
  $$: jest.fn(),
  waitForSelector: jest.fn(),
});

describe('Copart Extractors', () => {
  describe('extractAllDetails', () => {
    it('should extract vehicle details from API data', () => {
      const mockApiData = {
        seller_name: 'Copart Seller',
        title_code: 'CT',
        build_sheet: {
          technicalSpecification: {
            transmissionDescription: 'Automatic',
            displacement: '3.5L',
            fuelEconomyCity: '20 mpg',
            fuelEconomyHwy: '28 mpg',
          },
          engines: [
            {
              engineType: 'V6',
              displacement: { value: '3.5', uom: 'L' },
              netHorsePower: '290 HP',
            },
          ],
        },
      };

      const result = extractAllDetails(mockApiData);

      expect(result.seller?.name).toBe('Copart Seller');
      expect(result.specifications?.transmission_description).toBe('Automatic');
      expect(result.engines).toHaveLength(1);
      expect(result.engines?.[0].engine_type).toBe('V6');
    });

    it('should handle missing build_sheet gracefully', () => {
      const mockApiData = {};

      const result = extractAllDetails(mockApiData);

      expect(result).toBeDefined();
      expect(result.specifications).toBeDefined();
    });
  });

  describe('VinExtractor', () => {
    it('should validate VIN format correctly', () => {
      expect(VinExtractor.isValidVin('5YJ3E1EA5LF123456')).toBe(true);
      expect(VinExtractor.isValidVin('1HGBH41JXMN109186')).toBe(true);
      expect(VinExtractor.isValidVin('INVALID')).toBe(false);
      expect(VinExtractor.isValidVin('123')).toBe(false);
    });

    it('should extract VIN from lot page', async () => {
      const mockPage = createMockPage('5YJ3E1EA5LF123456');

      const result = await VinExtractor.extractFromLotPage(mockPage as any, '12345678');

      expect(result).toBe('5YJ3E1EA5LF123456');
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://www.copart.com/lot/12345678',
        expect.any(Object)
      );
    });

    it('should return N/A when VIN not found', async () => {
      const mockPage = createMockPage(null);

      const result = await VinExtractor.extractFromLotPage(mockPage as any, '12345678');

      expect(result).toBe('N/A');
    });
  });

  describe('ImagesExtractor', () => {
    it('should extract image gallery', async () => {
      const mockPage = createMockPage({
        images_gallery: [
          {
            thumbnail: 'https://example.com/img1_thb.jpg',
            full: 'https://example.com/img1_ful.jpg',
            high_res: 'https://example.com/img1_hrs.jpg',
          },
          {
            thumbnail: 'https://example.com/img2_thb.jpg',
            full: 'https://example.com/img2_ful.jpg',
            high_res: 'https://example.com/img2_hrs.jpg',
          },
        ],
        engine_video: 'https://example.com/video.mp4',
      });

      const result = await ImagesExtractor.extractFromLotPage(mockPage as any);

      expect(result.images_gallery).toHaveLength(2);
      expect(result.images_gallery[0].thumbnail).toContain('img1_thb');
      expect(result.images_gallery[0].full).toContain('img1_ful');
      expect(result.images_gallery[0].high_res).toContain('img1_hrs');
      expect(result.engine_video).toBe('https://example.com/video.mp4');
    });

    it('should return empty array when no images found', async () => {
      const mockPage = createMockPage({
        images_gallery: [],
        engine_video: 'N/A',
      });

      const result = await ImagesExtractor.extractFromLotPage(mockPage as any);

      expect(result.images_gallery).toEqual([]);
      expect(result.engine_video).toBe('N/A');
    });
  });

  describe('HighlightsExtractor', () => {
    it('should extract vehicle highlights', async () => {
      const mockPage = createMockPage([
        'Low Miles',
        'Clean Title',
        'Runs and Drives',
      ]);

      const result = await HighlightsExtractor.extractFromLotPage(mockPage as any);

      expect(result).toHaveLength(3);
      expect(result).toContain('Low Miles');
      expect(result).toContain('Clean Title');
    });

    it('should return empty array when no highlights', async () => {
      const mockPage = createMockPage([]);

      const result = await HighlightsExtractor.extractFromLotPage(mockPage as any);

      expect(result).toEqual([]);
    });
  });
});

