/**
 * Tests for Vehicle Transformer
 */

import { VehicleTransformer } from '../../../src/services/scrapers/platforms/copart/transformers/vehicle.transformer';

describe('VehicleTransformer', () => {
  describe('transformFromApi', () => {
    it('should transform basic vehicle data', () => {
      const apiData = {
        ln: '12345678',
        mkn: 'TESLA',
        lmdn: 'MODEL 3',
        lcy: 2020,
        fv: '5YJ3E1EA5LF123456',
        yn: 'Los Angeles, CA',
        tims: 'https://cs.copart.com/v1/AUTH_123/12345678_thb.jpg',
        ad: 1700000000000,
        dynamicLotDetails: {
          odometer: { value: '50000 miles' },
          estimatedRetailValue: { value: '$35,000' },
        },
        orr: '50000',
        otu: 'miles',
        erv: '$35,000',
      };

      const result = VehicleTransformer.transformFromApi(apiData as any);

      expect(result.lot_number).toBe('12345678');
      expect(result.make).toBe('TESLA');
      expect(result.vehicle_model).toBe('MODEL 3');
      expect(result.year).toBe('2020');
      expect(result.vin).toBe('5YJ3E1EA5LF123456');
      expect(result.location).toBe('Los Angeles, CA');
      expect(result.imageUrl).toContain('12345678_ful.jpg');
      expect(result.odometer).toContain('50000');
      expect(result.estimated_retail_value).toBe('$35,000');
    });

    it('should handle missing optional fields', () => {
      const apiData = {
        ln: '87654321',
        mkn: 'FORD',
        lmdn: 'F-150',
        lcy: 2019,
      };

      const result = VehicleTransformer.transformFromApi(apiData as any);

      expect(result.lot_number).toBe('87654321');
      expect(result.make).toBe('FORD');
      expect(result.vehicle_model).toBe('F-150');
      expect(result.year).toBe('2019');
      expect(result.vin).toBe('N/A');
      expect(result.location).toBe('N/A');
    });

    it('should build image gallery from solrImages', () => {
      const apiData = {
        ln: '11111111',
        mkn: 'HONDA',
        ldu: 'CIVIC',
        yn: 2021,
        lcy: 2021,
        solrImages: [
          {
            thumbnailUrl: 'https://example.com/img1_thb.jpg',
            fullUrl: 'https://example.com/img1_ful.jpg',
          },
          {
            thumbnailUrl: 'https://example.com/img2_thb.jpg',
            fullUrl: 'https://example.com/img2_ful.jpg',
          },
        ],
      };

      const result = VehicleTransformer.transformFromApi(apiData as any);

      expect(result.images_gallery).toHaveLength(2);
      expect(result.images_gallery[0].thumbnail).toBe('https://example.com/img1_thb.jpg');
      expect(result.images_gallery[0].full).toBe('https://example.com/img1_ful.jpg');
      expect(result.images_gallery[1].thumbnail).toBe('https://example.com/img2_thb.jpg');
      expect(result.images_gallery[1].full).toBe('https://example.com/img2_ful.jpg');
    });
  });
});
