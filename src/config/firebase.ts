/**
 * Firebase Admin SDK Configuration
 * 
 * Connects to Firestore using service account credentials
 * Shared database with SUM-Trading frontend
 */

import * as admin from 'firebase-admin';
import { Logger } from './logger';
import path from 'path';

const logger = Logger.getInstance();

let firebaseApp: admin.app.App;
let firestoreDb: admin.firestore.Firestore;

/**
 * Initialize Firebase Admin SDK
 */
export const initializeFirebase = (): admin.firestore.Firestore => {
  if (firestoreDb) {
    return firestoreDb;
  }

  try {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 
      path.join(__dirname, '../../studio-6719476275-3891a-firebase-adminsdk-fbsvc-c0dfeef39f.json');

    // Initialize Firebase Admin
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccountPath),
      projectId: 'studio-6719476275-3891a', // From service account
    });

    firestoreDb = admin.firestore();

    // Firestore settings
    firestoreDb.settings({
      ignoreUndefinedProperties: true,
    });

    logger.info('🔥 Firebase Admin initialized successfully');
    logger.info(`📊 Connected to project: studio-6719476275-3891a`);

    return firestoreDb;
  } catch (error) {
    logger.error('❌ Failed to initialize Firebase:', error);
    throw error;
  }
};

/**
 * Get Firestore database instance
 */
export const getFirestore = (): admin.firestore.Firestore => {
  if (!firestoreDb) {
    return initializeFirebase();
  }
  return firestoreDb;
};

/**
 * Get Firebase app instance
 */
export const getFirebaseApp = (): admin.app.App => {
  if (!firebaseApp) {
    initializeFirebase();
  }
  return firebaseApp;
};

/**
 * Firestore collection names (shared with SUM-Trading)
 */
export const COLLECTIONS = {
  VEHICLES: 'copart_vehicles',       // Copart scraped vehicles (legacy)
  SEARCH_BATCHES: 'search_batches',  // Optimized: searches/{query}/batches/{batchNumber}
  COPART_CACHE: 'copart_cache',      // Shared cache with frontend
  SEARCH_HISTORY: 'search_history',  // User search analytics
  API_REQUESTS: 'api_requests',      // API usage metrics
  GDPR_REQUESTS: 'gdpr_requests',    // GDPR compliance logs
  USERS: 'users',                    // User management (optional)
} as const;

/**
 * Firestore helpers
 */
export const FirestoreHelpers = {
  /**
   * Convert Firestore timestamp to ISO string
   */
  timestampToDate: (timestamp: admin.firestore.Timestamp): string => {
    return timestamp.toDate().toISOString();
  },

  /**
   * Create server timestamp
   */
  serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),

  /**
   * Increment field by value
   */
  increment: (value: number) => admin.firestore.FieldValue.increment(value),

  /**
   * Array union (add items without duplicates)
   */
  arrayUnion: (...elements: any[]) => admin.firestore.FieldValue.arrayUnion(...elements),

  /**
   * Array remove
   */
  arrayRemove: (...elements: any[]) => admin.firestore.FieldValue.arrayRemove(...elements),
};

export default {
  initializeFirebase,
  getFirestore,
  getFirebaseApp,
  COLLECTIONS,
  FirestoreHelpers,
};
