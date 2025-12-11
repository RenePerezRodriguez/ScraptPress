/**
 * Vehicle Repository - Firestore operations for vehicles
 *
 * Uses Firebase Firestore instead of PostgreSQL
 * Shared database with SUM-Trading frontend
 */

import { getFirestore, COLLECTIONS, FirestoreHelpers } from '../../config/firebase';
import { VehicleData } from '../../types/vehicle.types';
import { Logger } from '../../config/logger';
import type { PopularSearch, ApiHealthMetric, VehicleRequestData } from '../../types';
import * as admin from 'firebase-admin';

const logger = Logger.getInstance();

export class VehicleRepository {
  /**
   * Save or update vehicle in Firestore
   * Uses lot_number as document ID for automatic upsert
   * Accepts both VehicleData and OptimizedVehicle types
   */
  /**
   * Data structure for vehicle upsert
   * Combines VehicleData with potential scraping metadata
   */
  static async upsertVehicle(
    vehicle: Partial<VehicleData> & Record<string, unknown>,
  ): Promise<boolean> {
    try {
      const db = getFirestore();
      if (!vehicle.lot_number) {
        throw new Error('lot_number is required for upsert');
      }
      const docRef = db.collection(COLLECTIONS.VEHICLES).doc(vehicle.lot_number);

      // Handle both VehicleData (vehicle_model) and OptimizedVehicle (model) formats
      const model = vehicle.model || vehicle.vehicle_model || '';

      // Debug logging
      logger.debug(
        `Upserting vehicle: lot=${vehicle.lot_number}, make=${vehicle.make}, model=${model}, year=${vehicle.year}`,
      );

      // Generate search tokens for efficient searching
      // Include individual words from make and model for better matching
      const safeModel = String(model || '');
      const safeMake = String(vehicle.make || '');
      const safeYear = String(vehicle.year || '');

      // Generate search tokens for efficient searching
      // Include individual words from make and model for better matching
      const makeWords = safeMake.toLowerCase().split(/\s+/).filter(Boolean) || [];
      const modelWords = safeModel.toLowerCase().split(/\s+/).filter(Boolean) || [];

      const search_tokens = [
        // Original tokens (phrases)
        safeMake.toLowerCase(),
        safeModel.toLowerCase(),
        safeYear,
        vehicle.lot_number,
        `${safeYear} ${safeMake}`.toLowerCase(),
        `${safeMake} ${safeModel}`.toLowerCase(),
        `${safeYear} ${safeMake} ${safeModel}`.toLowerCase(),
        // Individual words from make and model
        ...makeWords,
        ...modelWords,
      ].filter(Boolean);

      logger.debug(`Generated search_tokens: ${JSON.stringify(search_tokens)}`);

      const vehicleDoc = {
        lot_number: vehicle.lot_number,
        make: vehicle.make,
        model: model,
        year: vehicle.year,
        vin: vehicle.vin || null,
        sale_date: vehicle.auction_date || null,
        sale_status: vehicle.sale_status || 'unknown',
        location: vehicle.location || null,
        primary_damage: vehicle.primary_damage || null,
        secondary_damage: vehicle.secondary_damage || null,
        odometer_reading: vehicle.odometer || null,
        estimated_retail_value: vehicle.estimated_retail_value || null,
        current_bid: vehicle.current_bid || null,
        sale_price: vehicle.current_bid || null, // Map current_bid to sale_price
        image_url: vehicle.imageUrl || null,
        images_gallery: vehicle.images_gallery || [],
        engine_video: vehicle.engine_video || null,
        highlights: vehicle.highlights || [],
        search_tokens,
        specifications: {},
        seller: {},
        // Ordering fields for maintaining scrape sequence
        scraped_index: vehicle.scraped_index || null,
        scraped_batch: vehicle.scraped_batch || null,
        scraped_query: vehicle.scraped_query || null,
        last_scraped_at: FirestoreHelpers.serverTimestamp(),
        updated_at: FirestoreHelpers.serverTimestamp(),
      };

      await docRef.set(vehicleDoc, { merge: true });

      logger.debug(
        `Vehicle ${vehicle.lot_number} saved with ${search_tokens.length} search tokens`,
      );
      return true;
    } catch (error) {
      logger.error(`Error saving vehicle ${vehicle.lot_number}:`, error);
      return false;
    }
  }

  /**
   * Get vehicle by lot number from Firestore
   */
  static async getVehicleByLot(lotNumber: string): Promise<VehicleData | null> {
    try {
      const db = getFirestore();
      const docRef = db.collection(COLLECTIONS.VEHICLES).doc(lotNumber);
      const doc = await docRef.get();

      if (!doc.exists) {
        return null;
      }

      const data = doc.data();
      if (!data) return null;

      // Map Firestore document back to VehicleData interface
      return {
        lot_number: data.lot_number,
        make: data.make,
        vehicle_model: data.model,
        year: data.year,
        vin: data.vin,
        auction_date: data.sale_date,
        sale_status: data.sale_status,
        location: data.location,
        primary_damage: data.primary_damage,
        secondary_damage: data.secondary_damage,
        odometer: data.odometer_reading,
        estimated_retail_value: data.estimated_retail_value,
        current_bid: data.current_bid,
        imageUrl: data.image_url,
        images_gallery: data.images_gallery,
        engine_video: data.engine_video,
        highlights: data.highlights,
      } as VehicleData;
    } catch (error) {
      logger.error(`Error fetching vehicle ${lotNumber}:`, error);
      return null;
    }
  }

  /**
   * Search vehicles by query in Firestore with pagination
   * Uses search_tokens array for efficient searching
   */
  static async searchVehicles(
    searchQuery: string,
    limit: number = 20,
    page: number = 1,
  ): Promise<VehicleData[]> {
    try {
      logger.info(`🔍 Searching vehicles: query="${searchQuery}", limit=${limit}, page=${page}`);
      const db = getFirestore();
      const query = searchQuery.toLowerCase().trim();
      const tokens = query.split(' ').filter(Boolean);
      logger.debug(`Search tokens: ${tokens.join(', ')}`);

      // Query with composite index (search_tokens + updated_at)
      // Calculate offset for pagination
      const offset = (page - 1) * limit;

      let firestoreQuery = db
        .collection(COLLECTIONS.VEHICLES)
        .where('search_tokens', 'array-contains-any', tokens)
        .orderBy('updated_at', 'desc')
        .limit(limit);

      // Add offset if not first page
      if (offset > 0) {
        firestoreQuery = firestoreQuery.offset(offset);
      }

      // Executing Firestore query
      const snapshot = await firestoreQuery.get();
      logger.debug(`Query returned ${snapshot.size} documents`);

      if (snapshot.size === 0) {
        logger.warn(
          `No documents found. Query: tokens=${JSON.stringify(tokens)}, limit=${limit}, offset=${offset}`,
        );
      }

      const vehicles: VehicleData[] = [];

      // Process all documents from snapshot
      snapshot.forEach((doc) => {
        const data = doc.data();
        vehicles.push({
          lot_number: data.lot_number,
          make: data.make,
          vehicle_model: data.model,
          year: data.year,
          vin: data.vin,
          auction_date: data.sale_date,
          sale_status: data.sale_status,
          location: data.location,
          primary_damage: data.primary_damage,
          secondary_damage: data.secondary_damage,
          odometer: data.odometer_reading,
          estimated_retail_value: data.estimated_retail_value,
          current_bid: data.current_bid,
          imageUrl: data.image_url,
          images_gallery: data.images_gallery,
          engine_video: data.engine_video,
          highlights: data.highlights,
        } as VehicleData);
      });

      logger.info(`✅ Found ${vehicles.length} vehicles for query "${searchQuery}" (page ${page})`);
      return vehicles;
    } catch (error) {
      logger.error('Error searching vehicles:', error);
      return [];
    }
  }

  /**
   * Count total vehicles matching query
   */
  static async countVehicles(searchQuery: string): Promise<number> {
    try {
      const db = getFirestore();
      const query = searchQuery.toLowerCase().trim();
      const tokens = query.split(' ').filter(Boolean);

      const snapshot = await db
        .collection(COLLECTIONS.VEHICLES)
        .where('search_tokens', 'array-contains-any', tokens)
        .count()
        .get();

      return snapshot.data().count;
    } catch (error) {
      logger.error('Error counting vehicles:', error);
      return 0;
    }
  }

  /**
   * Get recent vehicles from Firestore
   */
  static async getRecentVehicles(limit: number = 50): Promise<VehicleData[]> {
    try {
      const db = getFirestore();
      const snapshot = await db
        .collection(COLLECTIONS.VEHICLES)
        .orderBy('updated_at', 'desc')
        .limit(limit)
        .get();

      const vehicles: VehicleData[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        vehicles.push({
          lot_number: data.lot_number,
          make: data.make,
          vehicle_model: data.model,
          year: data.year,
          vin: data.vin,
          auction_date: data.sale_date,
          sale_status: data.sale_status,
          location: data.location,
          primary_damage: data.primary_damage,
          secondary_damage: data.secondary_damage,
          odometer: data.odometer_reading,
          estimated_retail_value: data.estimated_retail_value,
          current_bid: data.current_bid,
          imageUrl: data.image_url,
          images_gallery: data.images_gallery,
          engine_video: data.engine_video,
          highlights: data.highlights,
        } as VehicleData);
      });

      return vehicles;
    } catch (error) {
      logger.error(`Error fetching recent vehicles:`, error);
      return [];
    }
  }

  /**
   * Log search query to Firestore
   */
  static async logSearch(
    searchQuery: string,
    resultsCount: number,
    ipAddress: string | undefined,
    userAgent: string | undefined,
    responseTimeMs: number,
    success: boolean = true,
    errorMessage?: string,
  ): Promise<void> {
    try {
      const db = getFirestore();

      await db.collection(COLLECTIONS.SEARCH_HISTORY).add({
        query: searchQuery,
        results_count: resultsCount,
        ip_address: ipAddress || 'unknown',
        user_agent: userAgent || 'unknown',
        response_time_ms: responseTimeMs,
        success,
        error_message: errorMessage || null,
        created_at: FirestoreHelpers.serverTimestamp(),
      });
    } catch (error) {
      logger.error(`Error logging search:`, error);
    }
  }

  /**
   * Log API request to Firestore
   */
  static async logApiRequest(
    endpoint: string,
    method: string,
    statusCode: number,
    responseTimeMs: number,
    ipAddress: string | undefined,
    apiKeyUsed: boolean,
    errorMessage?: string,
  ): Promise<void> {
    try {
      const db = getFirestore();

      await db.collection(COLLECTIONS.API_REQUESTS).add({
        endpoint,
        method,
        status_code: statusCode,
        response_time_ms: responseTimeMs,
        ip_address: ipAddress || 'unknown',
        api_key_used: apiKeyUsed,
        error_message: errorMessage || null,
        created_at: FirestoreHelpers.serverTimestamp(),
      });
    } catch (error) {
      logger.error(`Error logging API request:`, error);
    }
  }

  /**
   * Get popular searches (last 30 days) from Firestore
   * Uses aggregation to count search queries
   */
  static async getPopularSearches(limit: number = 10): Promise<PopularSearch[]> {
    try {
      const db = getFirestore();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const snapshot = await db
        .collection(COLLECTIONS.SEARCH_HISTORY)
        .where('created_at', '>', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
        .where('success', '==', true)
        .orderBy('created_at', 'desc')
        .limit(1000) // Fetch last 1000 searches for aggregation
        .get();

      // Aggregate searches by query
      const searchCounts = new Map<
        string,
        { query: string; count: number; avg_results: number; total_results: number }
      >();

      snapshot.forEach((doc) => {
        const data = doc.data();
        const query = data.query?.toLowerCase() || '';

        if (query) {
          const existing = searchCounts.get(query) || {
            query,
            count: 0,
            avg_results: 0,
            total_results: 0,
          };
          existing.count++;
          existing.total_results += data.results_count || 0;
          existing.avg_results = Math.round(existing.total_results / existing.count);
          searchCounts.set(query, existing);
        }
      });

      // Sort by count and return top N
      return Array.from(searchCounts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
    } catch (error) {
      logger.error(`Error fetching popular searches:`, error);
      return [];
    }
  }

  /**
   * Get API health metrics from Firestore
   * Aggregates API request data
   */
  static async getApiHealthMetrics(): Promise<ApiHealthMetric[]> {
    try {
      const db = getFirestore();
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);

      const snapshot = await db
        .collection(COLLECTIONS.API_REQUESTS)
        .where('created_at', '>', admin.firestore.Timestamp.fromDate(oneDayAgo))
        .orderBy('created_at', 'desc')
        .limit(1000)
        .get();

      // Aggregate metrics
      let totalRequests = 0;
      let successCount = 0;
      let errorCount = 0;
      let totalResponseTime = 0;

      snapshot.forEach((doc) => {
        const data = doc.data();
        totalRequests++;

        if (data.status_code >= 200 && data.status_code < 400) {
          successCount++;
        } else {
          errorCount++;
        }

        totalResponseTime += data.response_time_ms || 0;
      });

      const avgResponseTime = totalRequests > 0 ? Math.round(totalResponseTime / totalRequests) : 0;
      const successRate = totalRequests > 0 ? Math.round((successCount / totalRequests) * 100) : 0;

      return [
        {
          period: 'last_24_hours',
          total_requests: totalRequests,
          successful_requests: successCount,
          failed_requests: errorCount,
          avg_response_time_ms: avgResponseTime,
          success_rate: successRate,
        },
      ];
    } catch (error) {
      logger.error(`Error fetching API health metrics:`, error);
      return [];
    }
  }

  /**
   * Save GDPR request to Firestore
   */
  static async saveGdprRequest(
    email: string,
    requestType: 'access' | 'delete' | 'portability',
    requestData?: VehicleRequestData,
  ): Promise<boolean> {
    try {
      const db = getFirestore();

      await db.collection(COLLECTIONS.GDPR_REQUESTS).add({
        email,
        request_type: requestType,
        request_data: requestData || {},
        status: 'pending',
        created_at: FirestoreHelpers.serverTimestamp(),
      });

      return true;
    } catch (error) {
      logger.error(`Error saving GDPR request:`, error);
      return false;
    }
  }

  /**
   * Delete old vehicles (older than 90 days) from Firestore
   */
  static async cleanupOldVehicles(): Promise<number> {
    try {
      const db = getFirestore();
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const snapshot = await db
        .collection(COLLECTIONS.VEHICLES)
        .where('updated_at', '<', admin.firestore.Timestamp.fromDate(ninetyDaysAgo))
        .limit(500) // Batch delete limit
        .get();

      if (snapshot.empty) {
        return 0;
      }

      // Batch delete
      const batch = db.batch();
      snapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      const deletedCount = snapshot.size;

      if (deletedCount > 0) {
        logger.info(`Cleaned up ${deletedCount} old vehicles from Firestore`);
      }

      return deletedCount;
    } catch (error) {
      logger.error(`Error cleaning up old vehicles:`, error);
      return 0;
    }
  }
}
