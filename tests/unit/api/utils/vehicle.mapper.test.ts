/**
 * Tests for Vehicle Mapper Utility
 */

import { VehicleMapper } from '../../../../src/api/utils/vehicle.mapper';

describe('VehicleMapper', () => {
  describe('toApiFormat', () => {
    it('should map VehicleData to OptimizedVehicle', () => {
      const vehicleData = {
        lot_number: '12345678',
        year: '2020',
        make: 'TESLA',
        vehicle_model: 'MODEL 3',
        trim: 'Long Range',
        vin: '5YJ3E1EA5LF123456',
        sale_status: 'On Approval',
        current_bid: '$25000',
        buy_it_now_price: '$30000',
        auction_date: '2025-12-01',
        location: 'Los Angeles, CA',
        location_city: 'Los Angeles',
        location_state: 'CA',
        location_country: 'USA',
        odometer: '50000 miles',
        odometer_status: 'Actual',
        primary_damage: 'Front End',
        secondary_damage: 'Minor',
        body_style: 'Sedan',
        doors: '4',
        color: 'White',
        interior_color: 'Black',
        engine: 'Electric',
        cylinders: '0',
        drive: 'AWD',
        transmission: 'Automatic',
        fuel: 'Electric',
        doc_type: 'Clean Title',
        title_type: 'Clean',
        is_clean_title: 'Yes',
        has_keys: 'Yes',
        engine_condition: 'Starts',
        estimated_retail_value: '$35000',
        imageUrl: 'https://example.com/image.jpg',
        images: ['https://example.com/img1.jpg'],
        images_gallery: [
          {
            thumbnail: 'https://example.com/thumb1.jpg',
            full: 'https://example.com/full1.jpg',
            high_res: 'https://example.com/high1.jpg',
          },
        ],
        engine_video: 'https://example.com/video.mp4',
        highlights: ['Low Miles', 'Clean Title'],
        damage_details: ['Front bumper damage'],
        copart_url: 'https://copart.com/lot/12345678',
      };

      const result = VehicleMapper.toApiFormat(vehicleData);

      expect(result.lot_number).toBe('12345678');
      expect(result.make).toBe('TESLA');
      expect(result.model).toBe('MODEL 3');
      expect(result.year).toBe('2020');
      expect(result.vin).toBe('5YJ3E1EA5LF123456');
      expect(result.imageUrl).toBe('https://example.com/image.jpg');
      expect(result.images_gallery).toHaveLength(1);
      expect(result.image_count).toBe(1);
    });

    it('should handle missing optional fields', () => {
      const minimalData = {
        lot_number: '87654321',
        year: '2019',
        make: 'FORD',
        vehicle_model: 'F-150',
        trim: 'N/A',
        vin: 'N/A',
        sale_status: 'N/A',
        current_bid: '$0',
        buy_it_now_price: 'N/A',
        auction_date: 'Future',
        location: 'N/A',
        location_city: 'N/A',
        location_state: 'N/A',
        location_country: 'N/A',
        odometer: 'N/A',
        odometer_status: 'N/A',
        primary_damage: 'N/A',
        secondary_damage: 'N/A',
        body_style: 'N/A',
        doors: 'N/A',
        color: 'N/A',
        interior_color: 'N/A',
        engine: 'N/A',
        cylinders: 'N/A',
        drive: 'N/A',
        transmission: 'N/A',
        fuel: 'N/A',
        doc_type: 'N/A',
        title_type: 'N/A',
        is_clean_title: 'N/A',
        has_keys: 'N/A',
        engine_condition: 'N/A',
        estimated_retail_value: 'N/A',
        imageUrl: 'N/A',
        images: [],
        images_gallery: [],
        engine_video: 'N/A',
        highlights: [],
        damage_details: [],
        copart_url: 'N/A',
      };

      const result = VehicleMapper.toApiFormat(minimalData);

      expect(result.lot_number).toBe('87654321');
      expect(result.make).toBe('FORD');
      expect(result.model).toBe('F-150');
      expect(result.images_gallery).toHaveLength(0);
      expect(result.image_count).toBe(0);
    });
  });
});
