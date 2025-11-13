"use strict";
/**
 * Tests for Vehicle Transformer
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vehicle_transformer_1 = require("../../../src/services/scrapers/platforms/copart/transformers/vehicle.transformer");
describe('VehicleTransformer', () => {
    describe('transformFromApi', () => {
        it('should transform basic vehicle data', () => {
            const apiData = {
                ln: '12345678',
                mkn: 'TESLA',
                ldu: 'MODEL 3',
                yn: 2020,
                vin: '5YJ3E1EA5LF123456',
                lcd: 'Los Angeles, CA',
                tims: 'https://cs.copart.com/v1/AUTH_123/12345678_ful.jpg',
                fda: 'Nov 15, 2025',
                dynamicLotDetails: {
                    odometer: { value: '50000 miles' },
                    estimatedRetailValue: { value: '$35,000' },
                },
            };
            const result = vehicle_transformer_1.VehicleTransformer.transformFromApi(apiData);
            expect(result.lot_number).toBe('12345678');
            expect(result.make).toBe('TESLA');
            expect(result.vehicle_model).toBe('MODEL 3');
            expect(result.year).toBe('2020');
            expect(result.vin).toBe('5YJ3E1EA5LF123456');
            expect(result.location).toBe('Los Angeles, CA');
            expect(result.imageUrl).toContain('12345678');
            expect(result.odometer_reading).toBe('50000 miles');
            expect(result.estimated_retail_value).toBe('$35,000');
        });
        it('should handle missing optional fields', () => {
            const apiData = {
                ln: '87654321',
                mkn: 'FORD',
                ldu: 'F-150',
                yn: 2019,
            };
            const result = vehicle_transformer_1.VehicleTransformer.transformFromApi(apiData);
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
            const result = vehicle_transformer_1.VehicleTransformer.transformFromApi(apiData);
            expect(result.images_gallery).toHaveLength(2);
            expect(result.images_gallery[0].thumbnail).toContain('img1_thb.jpg');
            expect(result.images_gallery[0].full).toContain('img1_ful.jpg');
        });
    });
    describe('optimizeForUi', () => {
        it('should optimize vehicle data for UI', () => {
            const fullData = {
                lot_number: '12345678',
                make: 'TESLA',
                vehicle_model: 'MODEL 3',
                year: '2020',
                vin: '5YJ3E1EA5LF123456',
                imageUrl: 'https://example.com/image.jpg',
                location: 'Los Angeles, CA',
                sale_date: 'Nov 15, 2025',
                odometer_reading: '50000 miles',
                estimated_retail_value: '$35,000',
                primary_damage: 'Front End',
                secondary_damage: 'Minor Dent',
                images_gallery: [],
                engine_video: 'N/A',
                highlights: [],
            };
            const result = vehicle_transformer_1.VehicleTransformer.optimizeForUi(fullData);
            expect(result.lot_number).toBe('12345678');
            expect(result.make).toBe('TESLA');
            expect(result.vehicle_model).toBe('MODEL 3');
            expect(result.year).toBe('2020');
            expect(result.vin).toBe('5YJ3E1EA5LF123456');
            expect(result.imageUrl).toBe('https://example.com/image.jpg');
            // Should not have extended fields
            expect(result).not.toHaveProperty('seller');
            expect(result).not.toHaveProperty('specifications');
        });
        it('should include essential fields only', () => {
            const fullData = {
                lot_number: '12345678',
                make: 'FORD',
                vehicle_model: 'F-150',
                year: '2019',
                vin: 'VIN123',
                imageUrl: 'image.jpg',
                location: 'Texas',
                sale_date: 'Dec 1, 2025',
                seller: { name: 'Seller Name' }, // Should be excluded
                specifications: { engine: 'V8' }, // Should be excluded
            };
            const result = vehicle_transformer_1.VehicleTransformer.optimizeForUi(fullData);
            expect(result).toHaveProperty('lot_number');
            expect(result).toHaveProperty('make');
            expect(result).not.toHaveProperty('seller');
            expect(result).not.toHaveProperty('specifications');
        });
    });
});
