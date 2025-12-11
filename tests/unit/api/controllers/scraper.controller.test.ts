/**
 * Tests for Scraper Controller
 */

import { Request, Response } from 'express';
import scraperController from '../../../../src/api/controllers/scraper.controller';
import { CopartPlatform } from '../../../../src/services/scrapers/platforms/copart/copart.platform';
import { VehicleRepository } from '../../../../src/services/repositories/vehicle.repository';

// Mock dependencies
jest.mock('../../../../src/services/scrapers/platforms/platform.factory', () => ({
  platformFactory: {
    createScraper: jest.fn()
  }
}));
jest.mock('../../../../src/services/repositories/vehicle.repository');

describe('ScraperController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;
  let mockScraper: any;

  beforeEach(() => {
    const { platformFactory } = require('../../../../src/services/scrapers/platforms/platform.factory');
    
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnThis();
    
    mockRequest = {
      body: {},
      params: {},
      query: {},
    };
    
    mockResponse = {
      json: mockJson,
      status: mockStatus,
    };

    mockScraper = {
      scrape: jest.fn(),
    };

    (platformFactory.createScraper as jest.Mock).mockReturnValue(mockScraper);

    jest.clearAllMocks();
  });

  describe('scrape', () => {
    it('should return vehicles for valid URL scraping', async () => {
      const mockVehicles = [
        {
          lot_number: '12345',
          make: 'TOYOTA',
          vehicle_model: 'CAMRY',
          year: '2020',
          vin: 'ABC123',
        },
      ];

      mockRequest.body = { 
        startUrl: 'https://www.copart.com/lot/12345',
        maxItems: 10 
      };
      
      mockScraper.scrape.mockResolvedValue(mockVehicles);
      (VehicleRepository.upsertVehicle as jest.Mock).mockResolvedValue(true);

      await scraperController.scrape(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Scraping successful'),
          data: mockVehicles,
          saved: 1,
        })
      );
    });

    it('should reject invalid URLs', async () => {
      mockRequest.body = { startUrl: 'https://example.com/invalid' };

      await scraperController.scrape(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid URL. Only copart.com URLs are supported.',
        })
      );
    });

    it('should handle scraping errors', async () => {
      mockRequest.body = { startUrl: 'https://www.copart.com/lot/12345' };
      
      mockScraper.scrape.mockRejectedValue(new Error('Scraping failed'));

      await scraperController.scrape(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'An error occurred while scraping.',
        })
      );
    });
  });

  describe('api', () => {
    it('should return vehicles with pagination', async () => {
      const mockVehicles = [
        {
          lot_number: '12345',
          make: 'TESLA',
          vehicle_model: 'MODEL 3',
          year: '2021',
        },
      ];

      mockRequest.body = { query: 'tesla', count: 5, page: 1 };
      
      mockScraper.scrape.mockResolvedValue(mockVehicles);

      await scraperController.api(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          query: 'tesla',
          page: 1,
          vehicles: mockVehicles,
          pagination: expect.objectContaining({
            currentPage: 1,
            totalReturned: 1,
          }),
        })
      );
    });

    it('should require query parameter', async () => {
      mockRequest.body = {};

      await scraperController.api(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'query parameter is required',
        })
      );
    });
  });

  describe('vehicleByLot', () => {
    it('should return vehicle by lot number', async () => {
      const mockVehicle = {
        lot_number: '12345678',
        make: 'HONDA',
        vehicle_model: 'CIVIC',
        year: '2022',
      };

      mockRequest.params = { lot: '12345678' };
      
      mockScraper.scrape.mockResolvedValue([mockVehicle]);

      await scraperController.vehicleByLot(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          lot: '12345678',
          vehicle: mockVehicle,
        })
      );
    });

    it('should return 404 when vehicle not found', async () => {
      mockRequest.params = { lot: '99999999' };
      
      mockScraper.scrape.mockResolvedValue([]);

      await scraperController.vehicleByLot(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Lot not found or no data extracted',
        })
      );
    });

    it('should handle missing lot parameter', async () => {
      mockRequest.params = {};
      mockRequest.query = {};

      await scraperController.vehicleByLot(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'lot parameter is required in path or query',
        })
      );
    });
  });
});
