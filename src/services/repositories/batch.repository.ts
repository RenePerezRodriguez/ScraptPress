/**
 * Batch Repository - Optimized Firestore structure
 * 
 * Structure: searches/{query}/batches/{batchNumber}
 * Each batch stores 100 vehicles (1 Copart page) as a single document
 * 
 * System:
 * - Batch 0: Copart page 1 (vehicles 1-100) → Frontend pages 1-10
 * - Batch 1: Copart page 2 (vehicles 101-200) → Frontend pages 11-20
 * - Batch 2: Copart page 3 (vehicles 201-300) → Frontend pages 21-30
 * 
 * Benefits:
 * - 1 read instead of 100 individual reads (100x faster)
 * - Natural ordering (array index)
 * - Perfect for Redis cache
 * - TTL per batch
 * - Query isolation
 */

import { getFirestore, FirestoreHelpers } from '../../config/firebase';
import { Logger } from '../../config/logger';
import * as admin from 'firebase-admin';

const logger = Logger.getInstance();

export interface BatchMetadata {
  batchNumber: number;
  size: number;
  query: string;
  createdAt: admin.firestore.Timestamp;
  expiresAt: admin.firestore.Timestamp;
  source: string;
  scrapeDuration: number;
}

export interface BatchDocument {
  metadata: BatchMetadata;
  vehicles: any[];
}

export class BatchRepository {
  /**
   * Save complete batch to Firestore
   * Path: searches/{query}/batches/{batchNumber}
   */
  static async saveBatch(
    query: string,
    batchNumber: number,
    vehicles: any[],
    scrapeDuration: number
  ): Promise<boolean> {
    try {
      const db = getFirestore();
      const normalizedQuery = query.toLowerCase().trim();
      
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 días TTL
      
      const batchDoc: BatchDocument = {
        metadata: {
          batchNumber,
          size: vehicles.length,
          query: normalizedQuery,
          createdAt: FirestoreHelpers.serverTimestamp() as any,
          expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
          source: 'copart',
          scrapeDuration
        },
        vehicles: vehicles.map((v, index) => ({
          ...v,
          batchIndex: index // Position within batch (0-99)
        }))
      };
      
      await db
        .collection('searches')
        .doc(normalizedQuery)
        .collection('batches')
        .doc(batchNumber.toString())
        .set(batchDoc);
      
      logger.info(`✅ Saved batch ${batchNumber} for "${query}": ${vehicles.length} vehicles`);
      
      // Update search metadata
      await this.updateSearchMetadata(normalizedQuery, batchNumber, vehicles.length);
      
      return true;
    } catch (error) {
      logger.error(`Error saving batch ${batchNumber} for "${query}":`, error);
      return false;
    }
  }

  /**
   * Get batch from Firestore
   * Returns null if not found or expired
   */
  static async getBatch(query: string, batchNumber: number): Promise<any[] | null> {
    try {
      const db = getFirestore();
      const normalizedQuery = query.toLowerCase().trim();
      
      const batchRef = db
        .collection('searches')
        .doc(normalizedQuery)
        .collection('batches')
        .doc(batchNumber.toString());
      
      const batchDoc = await batchRef.get();
      
      if (!batchDoc.exists) {
        logger.debug(`Batch ${batchNumber} not found for "${query}"`);
        return null;
      }
      
      const data = batchDoc.data() as BatchDocument;
      
      // Check if expired
      const now = admin.firestore.Timestamp.now();
      if (data.metadata.expiresAt < now) {
        logger.info(`Batch ${batchNumber} expired for "${query}", deleting...`);
        await batchRef.delete();
        return null;
      }
      
      logger.debug(`✅ Retrieved batch ${batchNumber} for "${query}": ${data.vehicles.length} vehicles`);
      return data.vehicles;
    } catch (error) {
      logger.error(`Error getting batch ${batchNumber} for "${query}":`, error);
      return null;
    }
  }

  /**
   * Check if batch exists and is not expired
   */
  static async batchExists(query: string, batchNumber: number): Promise<boolean> {
    try {
      const db = getFirestore();
      const normalizedQuery = query.toLowerCase().trim();
      
      const batchDoc = await db
        .collection('searches')
        .doc(normalizedQuery)
        .collection('batches')
        .doc(batchNumber.toString())
        .get();
      
      if (!batchDoc.exists) {
        return false;
      }
      
      const data = batchDoc.data() as BatchDocument;
      const now = admin.firestore.Timestamp.now();
      
      return data.metadata.expiresAt >= now;
    } catch (error) {
      logger.error(`Error checking batch ${batchNumber} for "${query}":`, error);
      return false;
    }
  }

  /**
   * Update search metadata (total vehicles, batches, etc.)
   */
  private static async updateSearchMetadata(
    query: string,
    batchNumber: number,
    vehicleCount: number
  ): Promise<void> {
    try {
      const db = getFirestore();
      const searchRef = db.collection('searches').doc(query);
      
      const searchDoc = await searchRef.get();
      
      if (searchDoc.exists) {
        // Update existing metadata
        await searchRef.update({
          'metadata.lastUpdated': FirestoreHelpers.serverTimestamp(),
          'metadata.totalBatches': batchNumber + 1,
          'metadata.searchCount': FirestoreHelpers.increment(1)
        });
      } else {
        // Create new metadata
        await searchRef.set({
          metadata: {
            query,
            totalVehicles: vehicleCount,
            totalBatches: batchNumber + 1,
            batchSize: 50,
            lastUpdated: FirestoreHelpers.serverTimestamp(),
            searchCount: 1,
            createdAt: FirestoreHelpers.serverTimestamp()
          }
        });
      }
    } catch (error) {
      logger.error(`Error updating metadata for "${query}":`, error);
    }
  }

  /**
   * Get search metadata
   */
  static async getSearchMetadata(query: string): Promise<any | null> {
    try {
      const db = getFirestore();
      const normalizedQuery = query.toLowerCase().trim();
      
      const searchDoc = await db
        .collection('searches')
        .doc(normalizedQuery)
        .get();
      
      if (!searchDoc.exists) {
        return null;
      }
      
      return searchDoc.data()?.metadata || null;
    } catch (error) {
      logger.error(`Error getting metadata for "${query}":`, error);
      return null;
    }
  }

  /**
   * Delete expired batches for a query
   */
  static async deleteExpiredBatches(query: string): Promise<number> {
    try {
      const db = getFirestore();
      const normalizedQuery = query.toLowerCase().trim();
      const now = admin.firestore.Timestamp.now();
      
      const expiredBatches = await db
        .collection('searches')
        .doc(normalizedQuery)
        .collection('batches')
        .where('metadata.expiresAt', '<', now)
        .get();
      
      if (expiredBatches.empty) {
        return 0;
      }
      
      const batch = db.batch();
      expiredBatches.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      
      logger.info(`🗑️ Deleted ${expiredBatches.size} expired batches for "${query}"`);
      return expiredBatches.size;
    } catch (error) {
      logger.error(`Error deleting expired batches for "${query}":`, error);
      return 0;
    }
  }

  /**
   * Delete all batches for a query
   */
  static async deleteAllBatches(query: string): Promise<boolean> {
    try {
      const db = getFirestore();
      const normalizedQuery = query.toLowerCase().trim();
      
      const batches = await db
        .collection('searches')
        .doc(normalizedQuery)
        .collection('batches')
        .get();
      
      if (batches.empty) {
        return true;
      }
      
      const batch = db.batch();
      batches.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      
      // Delete search metadata
      await db.collection('searches').doc(normalizedQuery).delete();
      
      logger.info(`🗑️ Deleted all batches for "${query}"`);
      return true;
    } catch (error) {
      logger.error(`Error deleting all batches for "${query}":`, error);
      return false;
    }
  }

  /**
   * Get popular searches
   */
  static async getPopularSearches(limit: number = 10): Promise<any[]> {
    try {
      const db = getFirestore();
      
      const snapshot = await db
        .collection('searches')
        .orderBy('metadata.searchCount', 'desc')
        .limit(limit)
        .get();
      
      const popularSearches: any[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        popularSearches.push({
          query: doc.id,
          ...data.metadata
        });
      });
      
      return popularSearches;
    } catch (error) {
      logger.error('Error getting popular searches:', error);
      return [];
    }
  }

  /**
   * Cleanup all expired batches (run periodically)
   */
  static async cleanupAllExpiredBatches(): Promise<number> {
    try {
      const db = getFirestore();
      const now = admin.firestore.Timestamp.now();
      let totalDeleted = 0;
      
      // Get all searches
      const searches = await db.collection('searches').get();
      
      for (const searchDoc of searches.docs) {
        const query = searchDoc.id;
        const deleted = await this.deleteExpiredBatches(query);
        totalDeleted += deleted;
      }
      
      if (totalDeleted > 0) {
        logger.info(`🧹 Cleanup complete: Deleted ${totalDeleted} expired batches`);
      }
      
      return totalDeleted;
    } catch (error) {
      logger.error('Error cleaning up expired batches:', error);
      return 0;
    }
  }
}
