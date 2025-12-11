/**
 * Page Repository - Optimized Firestore structure with dynamic page sizes
 *
 * Structure: searches/{query}/cache/{page}-{limit}
 * Each cache document stores exactly {limit} vehicles for a specific page
 *
 * System:
 * - Page 1, Limit 10: cache/1-10 (10 vehicles) → ~2 min scraping
 * - Page 1, Limit 50: cache/1-50 (50 vehicles) → ~10 min scraping
 * - Page 1, Limit 100: cache/1-100 (100 vehicles) → ~20 min scraping
 * - Page 2, Limit 10: cache/2-10 (10 vehicles) → ~2 min scraping
 *
 * Benefits:
 * - 1 read per page request (instant cache hits)
 * - User controls scraping time via limit selection
 * - No collisions between different limits
 * - Isolated locks per page+limit combination
 * - TTL per cache document
 * - Predictable prefetch (always next page with same limit)
 */

import { getFirestore, FirestoreHelpers } from '../../config/firebase';
import { Logger } from '../../config/logger';
import type { BatchVehicle, PopularSearch } from '../../types';
import * as admin from 'firebase-admin';

const logger = Logger.getInstance();

export interface PageMetadata {
  page: number;
  limit: number;
  size: number;
  query: string;
  createdAt: admin.firestore.Timestamp;
  expiresAt: admin.firestore.Timestamp;
  source: string;
  scrapeDuration: number;
}

export interface PageDocument {
  metadata: PageMetadata;
  vehicles: BatchVehicle[];
}

export class BatchRepository {
  /**
   * Save complete page to Firestore
   * Path: searches/{query}/cache/{page}-{limit}
   */
  static async savePage(
    query: string,
    page: number,
    limit: number,
    vehicles: BatchVehicle[],
    scrapeDuration: number,
  ): Promise<boolean> {
    try {
      const db = getFirestore();
      const normalizedQuery = query.toLowerCase().trim();
      const cacheKey = `${page}-${limit}`;

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 días TTL

      const pageDoc: PageDocument = {
        metadata: {
          page,
          limit,
          size: vehicles.length,
          query: normalizedQuery,
          createdAt: FirestoreHelpers.serverTimestamp() as unknown as admin.firestore.Timestamp,
          expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
          source: 'copart',
          scrapeDuration,
        },
        vehicles: vehicles.map((v, index) => ({
          ...v,
          pageIndex: index, // Position within page (0-based)
        })),
      };

      await db
        .collection('searches')
        .doc(normalizedQuery)
        .collection('cache')
        .doc(cacheKey)
        .set(pageDoc);

      logger.info(
        `✅ Saved page ${page} (limit ${limit}) for "${query}": ${vehicles.length} vehicles`,
      );

      // Update search metadata
      await this.updateSearchMetadata(normalizedQuery, page, limit, vehicles.length);

      return true;
    } catch (error) {
      logger.error(`Error saving page ${page} (limit ${limit}) for "${query}":`, error);
      return false;
    }
  }

  /**
   * Get page from Firestore
   * Returns null if not found or expired
   */
  static async getPage(query: string, page: number, limit: number): Promise<BatchVehicle[] | null> {
    try {
      const db = getFirestore();
      const normalizedQuery = query.toLowerCase().trim();
      const cacheKey = `${page}-${limit}`;

      const pageRef = db
        .collection('searches')
        .doc(normalizedQuery)
        .collection('cache')
        .doc(cacheKey);

      const pageDoc = await pageRef.get();

      if (!pageDoc.exists) {
        logger.debug(`Page ${page} (limit ${limit}) not found for "${query}"`);
        return null;
      }

      const data = pageDoc.data() as PageDocument;

      // Check if expired
      const now = admin.firestore.Timestamp.now();
      if (data.metadata.expiresAt < now) {
        logger.info(`Page ${page} (limit ${limit}) expired for "${query}", deleting...`);
        await pageRef.delete();
        return null;
      }

      logger.debug(
        `✅ Retrieved page ${page} (limit ${limit}) for "${query}": ${data.vehicles.length} vehicles`,
      );
      return data.vehicles;
    } catch (error) {
      logger.error(`Error getting page ${page} (limit ${limit}) for "${query}":`, error);
      return null;
    }
  }

  /**
   * Check if page exists and is not expired
   */
  static async pageExists(query: string, page: number, limit: number): Promise<boolean> {
    try {
      const db = getFirestore();
      const normalizedQuery = query.toLowerCase().trim();
      const cacheKey = `${page}-${limit}`;

      const pageDoc = await db
        .collection('searches')
        .doc(normalizedQuery)
        .collection('cache')
        .doc(cacheKey)
        .get();

      if (!pageDoc.exists) {
        return false;
      }

      const data = pageDoc.data() as PageDocument;
      const now = admin.firestore.Timestamp.now();

      return data.metadata.expiresAt >= now;
    } catch (error) {
      logger.error(`Error checking page ${page} (limit ${limit}) for "${query}":`, error);
      return false;
    }
  }

  /**
   * Update search metadata (track popular searches and cache info)
   */
  private static async updateSearchMetadata(
    query: string,
    page: number,
    limit: number,
    vehicleCount: number,
  ): Promise<void> {
    try {
      const db = getFirestore();
      const normalizedQuery = query.toLowerCase().trim();

      // Validate query
      if (!normalizedQuery || normalizedQuery.length === 0) {
        logger.error(
          `❌ Invalid query received in updateSearchMetadata: "${query}" (normalized: "${normalizedQuery}")`,
        );
        return;
      }

      // Skip metadata for lot numbers (pure numeric queries)
      // Lot numbers are vehicle-specific searches, not general search queries
      if (/^\d+$/.test(normalizedQuery)) {
        logger.debug(`⏭️ Skipping metadata for lot number: "${normalizedQuery}"`);
        return;
      }

      const searchRef = db.collection('searches').doc(normalizedQuery);

      logger.debug(
        `📝 Updating metadata: "${normalizedQuery}" (page: ${page}, limit: ${limit}, vehicles: ${vehicleCount})`,
      );

      const searchDoc = await searchRef.get();

      if (searchDoc.exists) {
        // Update existing metadata
        logger.debug(`  ↪ Incrementing searchCount for "${normalizedQuery}"`);
        await searchRef.update({
          'metadata.lastUpdated': FirestoreHelpers.serverTimestamp(),
          'metadata.searchCount': FirestoreHelpers.increment(1),
        });
      } else {
        // Create new metadata
        logger.info(`  ↪ Creating NEW metadata document for "${normalizedQuery}"`);
        await searchRef.set({
          metadata: {
            query: normalizedQuery,
            lastUpdated: FirestoreHelpers.serverTimestamp(),
            searchCount: 1,
            createdAt: FirestoreHelpers.serverTimestamp(),
          },
        });
      }
    } catch (error) {
      logger.error(`Error updating metadata for "${query}":`, error);
    }
  }

  /**
   * Get search metadata
   */
  static async getSearchMetadata(query: string): Promise<Record<string, unknown> | null> {
    try {
      const db = getFirestore();
      const normalizedQuery = query.toLowerCase().trim();

      const searchDoc = await db.collection('searches').doc(normalizedQuery).get();

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
   * Delete expired pages for a query
   */
  static async deleteExpiredPages(query: string): Promise<number> {
    try {
      const db = getFirestore();
      const normalizedQuery = query.toLowerCase().trim();
      const now = admin.firestore.Timestamp.now();

      const expiredPages = await db
        .collection('searches')
        .doc(normalizedQuery)
        .collection('cache')
        .where('metadata.expiresAt', '<', now)
        .get();

      if (expiredPages.empty) {
        return 0;
      }

      const batch = db.batch();
      expiredPages.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      logger.info(`🗑️ Deleted ${expiredPages.size} expired pages for "${query}"`);
      return expiredPages.size;
    } catch (error) {
      logger.error(`Error deleting expired pages for "${query}":`, error);
      return 0;
    }
  }

  /**
   * Delete all pages for a query
   */
  static async deleteAllPages(query: string): Promise<boolean> {
    try {
      const db = getFirestore();
      const normalizedQuery = query.toLowerCase().trim();

      const pages = await db.collection('searches').doc(normalizedQuery).collection('cache').get();

      if (pages.empty) {
        return true;
      }

      const batch = db.batch();
      pages.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      // Delete search metadata
      await db.collection('searches').doc(normalizedQuery).delete();

      logger.info(`🗑️ Deleted all pages for "${query}"`);
      return true;
    } catch (error) {
      logger.error(`Error deleting all pages for "${query}":`, error);
      return false;
    }
  }

  /**
   * Get popular searches
   */
  static async getPopularSearches(limit: number = 10): Promise<PopularSearch[]> {
    try {
      const db = getFirestore();

      const snapshot = await db
        .collection('searches')
        .orderBy('metadata.searchCount', 'desc')
        .limit(limit)
        .get();

      const popularSearches: PopularSearch[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        popularSearches.push({
          query: doc.id,
          ...data.metadata,
        });
      });

      return popularSearches;
    } catch (error) {
      logger.error('Error getting popular searches:', error);
      return [];
    }
  }

  /**
   * Update job status in Firestore
   * Used by worker to track job progress
   */
  static async updateJobStatus(
    batchId: string,
    status: 'queued' | 'processing' | 'completed' | 'failed',
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      const db = getFirestore();

      await db
        .collection('jobs')
        .doc(batchId)
        .set(
          {
            status,
            updatedAt: FirestoreHelpers.serverTimestamp(),
            ...metadata,
          },
          { merge: true },
        );

      logger.debug(`Updated job status: ${batchId} -> ${status}`);
    } catch (error) {
      logger.error(`Error updating job status ${batchId}:`, error);
      throw error;
    }
  }

  /**
   * Get job status from Firestore
   */
  static async getJobStatus(batchId: string): Promise<Record<string, unknown> | null> {
    try {
      const db = getFirestore();
      const jobDoc = await db.collection('jobs').doc(batchId).get();

      if (!jobDoc.exists) {
        return null;
      }

      return (jobDoc.data() as Record<string, unknown>) || null;
    } catch (error) {
      logger.error(`Error getting job status ${batchId}:`, error);
      return null;
    }
  }

  /**
   * Cleanup all expired pages (run periodically)
   */
  static async cleanupAllExpiredPages(): Promise<number> {
    try {
      const db = getFirestore();
      let totalDeleted = 0;

      // Get all searches
      const searches = await db.collection('searches').get();

      for (const searchDoc of searches.docs) {
        const query = searchDoc.id;
        const deleted = await this.deleteExpiredPages(query);
        totalDeleted += deleted;
      }

      if (totalDeleted > 0) {
        logger.info(`🧹 Cleanup complete: Deleted ${totalDeleted} expired pages`);
      }

      return totalDeleted;
    } catch (error) {
      logger.error('Error cleaning up expired pages:', error);
      return 0;
    }
  }
}
