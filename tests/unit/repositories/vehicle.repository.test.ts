/**
 * Vehicle Repository Tests
 * Tests for Firestore database operations
 */

import { VehicleRepository } from '../../../src/services/repositories/vehicle.repository';

// Mock Firebase config first (before importing admin)
const mockDoc = {
  set: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue({
    exists: true,
    data: () => ({
      lot_number: 'TEST123',
      make: 'Toyota',
      model: 'Camry',
      year: 2024,
    }),
  }),
  delete: jest.fn().mockResolvedValue(undefined),
};

const mockCollection = {
  doc: jest.fn(() => mockDoc),
  add: jest.fn().mockResolvedValue({ id: 'mock-id' }),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  get: jest.fn().mockResolvedValue({
    empty: false,
    size: 2,
    forEach: jest.fn((callback) => {
      callback({
        data: () => ({
          lot_number: 'TEST123',
          make: 'Toyota',
          model: 'Camry',
          year: 2024,
        }),
      });
      callback({
        data: () => ({
          lot_number: 'TEST456',
          make: 'Honda',
          model: 'Civic',
          year: 2023,
        }),
      });
    }),
  }),
};

const mockFirestore = {
  collection: jest.fn(() => mockCollection),
  batch: jest.fn(() => ({
    delete: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  })),
};

jest.mock('../../../src/config/firebase', () => ({
  getFirestore: jest.fn(() => mockFirestore),
  COLLECTIONS: {
    VEHICLES: 'copart_vehicles',
    SEARCH_HISTORY: 'search_history',
    API_REQUESTS: 'api_requests',
    GDPR_REQUESTS: 'gdpr_requests',
  },
  FirestoreHelpers: {
    serverTimestamp: jest.fn(() => ({ _seconds: 1234567890 })),
    increment: jest.fn((n) => n),
  },
}));

// Mock logger
jest.mock('../../../src/config/logger', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      debug: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    })),
  },
}));

// Mock Firebase Admin (simple mock)
jest.mock('firebase-admin', () => ({
  firestore: {
    Timestamp: {
      fromDate: jest.fn((date) => ({ _seconds: Math.floor(date.getTime() / 1000) })),
    },
  },
}));

describe('VehicleRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('upsertVehicle', () => {
    it('should save a vehicle successfully', async () => {
      const vehicle = {
        lot_number: 'TEST123',
        make: 'Toyota',
        model: 'Camry',
        year: 2024,
        vin: 'VIN123456',
        auction_date: '2025-01-15',
        sale_status: 'upcoming',
        location: 'CA - Los Angeles',
        primary_damage: 'Front End',
        odometer: 50000,
        current_bid: 5000,
        imageUrl: 'https://example.com/image.jpg',
        images_gallery: [],
        highlights: ['Clean Title'],
      };

      const result = await VehicleRepository.upsertVehicle(vehicle);

      expect(result).toBe(true);
      expect(mockFirestore.collection).toHaveBeenCalledWith('copart_vehicles');
      expect(mockCollection.doc).toHaveBeenCalledWith('TEST123');
      expect(mockDoc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          lot_number: 'TEST123',
          make: 'Toyota',
          model: 'Camry',
          year: 2024,
        }),
        { merge: true }
      );
    });

    it('should handle OptimizedVehicle format (model field)', async () => {
      const vehicle = {
        lot_number: 'TEST456',
        make: 'Honda',
        model: 'Civic', // OptimizedVehicle uses 'model' not 'vehicle_model'
        year: 2023,
        vin: 'VIN789',
        auction_date: '2025-02-01',
        sale_status: 'live',
        location: 'TX - Dallas',
        odometer: 30000,
        current_bid: 4000,
        imageUrl: 'https://example.com/civic.jpg',
      };

      const result = await VehicleRepository.upsertVehicle(vehicle);

      expect(result).toBe(true);
      expect(mockDoc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'Civic', // Should map correctly
        }),
        { merge: true }
      );
    });

    it('should return false on error', async () => {
      mockDoc.set.mockRejectedValueOnce(new Error('Firestore error'));

      const vehicle = {
        lot_number: 'ERROR123',
        make: 'Test',
        model: 'Error',
        year: 2024,
      };

      const result = await VehicleRepository.upsertVehicle(vehicle);

      expect(result).toBe(false);
    });
  });

  describe('getVehicleByLot', () => {
    it('should retrieve a vehicle by lot number', async () => {
      const result = await VehicleRepository.getVehicleByLot('TEST123');

      expect(result).toBeTruthy();
      expect(result?.lot_number).toBe('TEST123');
      expect(result?.make).toBe('Toyota');
      expect(mockFirestore.collection).toHaveBeenCalledWith('copart_vehicles');
      expect(mockCollection.doc).toHaveBeenCalledWith('TEST123');
    });

    it('should return null if vehicle not found', async () => {
      mockDoc.get.mockResolvedValueOnce({ exists: false });

      const result = await VehicleRepository.getVehicleByLot('NOTFOUND');

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockDoc.get.mockRejectedValueOnce(new Error('Firestore error'));

      const result = await VehicleRepository.getVehicleByLot('ERROR');

      expect(result).toBeNull();
    });
  });

  describe('searchVehicles', () => {
    it('should search vehicles by query', async () => {
      const results = await VehicleRepository.searchVehicles('toyota', 20, 0);

      expect(results).toHaveLength(1); // Only Toyota matches
      expect(results[0].make).toBe('Toyota');
      expect(mockFirestore.collection).toHaveBeenCalledWith('copart_vehicles');
    });

    it('should respect limit parameter', async () => {
      await VehicleRepository.searchVehicles('car', 5, 0);

      expect(mockCollection.limit).toHaveBeenCalledWith(100); // Fetches 100 for filtering
    });

    it('should return empty array on error', async () => {
      mockCollection.get.mockRejectedValueOnce(new Error('Firestore error'));

      const results = await VehicleRepository.searchVehicles('error', 20, 0);

      expect(results).toEqual([]);
    });
  });

  describe('logSearch', () => {
    it('should log a search query', async () => {
      await VehicleRepository.logSearch(
        'toyota camry',
        10,
        '192.168.1.1',
        'Mozilla/5.0',
        150,
        true
      );

      expect(mockFirestore.collection).toHaveBeenCalledWith('search_history');
      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'toyota camry',
          results_count: 10,
          ip_address: '192.168.1.1',
          success: true,
        })
      );
    });

    it('should not throw on logging error', async () => {
      mockCollection.add.mockRejectedValueOnce(new Error('Firestore error'));

      await expect(
        VehicleRepository.logSearch('test', 0, '127.0.0.1', 'test', 100, false)
      ).resolves.not.toThrow();
    });
  });

  describe('saveGdprRequest', () => {
    it('should save GDPR request', async () => {
      const result = await VehicleRepository.saveGdprRequest(
        'user@example.com',
        'delete',
        { reason: 'user request' }
      );

      expect(result).toBe(true);
      expect(mockFirestore.collection).toHaveBeenCalledWith('gdpr_requests');
      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'user@example.com',
          request_type: 'delete',
          status: 'pending',
        })
      );
    });

    it('should return false on error', async () => {
      mockCollection.add.mockRejectedValueOnce(new Error('Firestore error'));

      const result = await VehicleRepository.saveGdprRequest(
        'error@test.com',
        'access'
      );

      expect(result).toBe(false);
    });
  });

  describe('cleanupOldVehicles', () => {
    it('should delete old vehicles', async () => {
      const mockBatch = {
        delete: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
      };

      mockFirestore.batch.mockReturnValue(mockBatch);

      mockCollection.get.mockResolvedValueOnce({
        empty: false,
        size: 5,
        forEach: jest.fn((callback) => {
          for (let i = 0; i < 5; i++) {
            callback({ ref: { id: `old-${i}` } });
          }
        }),
      });

      const deletedCount = await VehicleRepository.cleanupOldVehicles();

      expect(deletedCount).toBe(5);
      expect(mockBatch.delete).toHaveBeenCalledTimes(5);
      expect(mockBatch.commit).toHaveBeenCalled();
    });

    it('should return 0 if no old vehicles', async () => {
      mockCollection.get.mockResolvedValueOnce({ empty: true, size: 0 });

      const deletedCount = await VehicleRepository.cleanupOldVehicles();

      expect(deletedCount).toBe(0);
    });

    it('should return 0 on error', async () => {
      mockCollection.get.mockRejectedValueOnce(new Error('Firestore error'));

      const deletedCount = await VehicleRepository.cleanupOldVehicles();

      expect(deletedCount).toBe(0);
    });
  });
});
