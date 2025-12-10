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
    let credential;

    // Option 1: JSON string in environment variable (for Cloud Run)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      credential = admin.credential.cert(serviceAccount);
      logger.info('🔥 Using Firebase credentials from FIREBASE_SERVICE_ACCOUNT_JSON');
    }
    // Option 2: Path to JSON file (for local development)
    else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      credential = admin.credential.cert(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      logger.info('🔥 Using Firebase credentials from file path');
    }
    // Option 3: Standard GOOGLE_APPLICATION_CREDENTIALS
    else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // Si es relativa, resolver desde CWD
      const credPath = path.isAbsolute(process.env.GOOGLE_APPLICATION_CREDENTIALS)
        ? process.env.GOOGLE_APPLICATION_CREDENTIALS
        : path.join(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS);

      credential = admin.credential.cert(credPath);
      logger.info(`🔥 Using Firebase credentials from GOOGLE_APPLICATION_CREDENTIALS: ${credPath}`);
    }
    // Option 4: Explicit Path in config/credentials (Fallback)
    else {
      const defaultPath = path.join(
        process.cwd(),
        'config',
        'credentials',
        'studio-6719476275-3891a-firebase-adminsdk-fbsvc-c0dfeef39f.json',
      );
      credential = admin.credential.cert(defaultPath);
      logger.info(`🔥 Using Firebase credentials from default path: ${defaultPath}`);
    }

    // Initialize Firebase Admin
    firebaseApp = admin.initializeApp({
      credential,
      projectId: 'studio-6719476275-3891a',
    });

    firestoreDb = admin.firestore();

    // Firestore settings
    firestoreDb.settings({
      ignoreUndefinedProperties: true,
    });

    logger.info('✅ Firebase Admin initialized successfully');
    logger.info(`📊 Connected to project: studio-6719476275-3891a`);

    return firestoreDb;
  } catch (error) {
    logger.error('❌ Failed to initialize Firebase:', error as Error);
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
  VEHICLES: 'copart_vehicles', // Copart scraped vehicles (legacy)
  SEARCH_BATCHES: 'search_batches', // Optimized: searches/{query}/batches/{batchNumber}
  COPART_CACHE: 'copart_cache', // Shared cache with frontend
  SEARCH_HISTORY: 'search_history', // User search analytics
  API_REQUESTS: 'api_requests', // API usage metrics
  GDPR_REQUESTS: 'gdpr_requests', // GDPR compliance logs
  USERS: 'users', // User management (optional)
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
  arrayUnion: (...elements: unknown[]) => admin.firestore.FieldValue.arrayUnion(...elements),

  /**
   * Array remove
   */
  arrayRemove: (...elements: unknown[]) => admin.firestore.FieldValue.arrayRemove(...elements),
};

export default {
  initializeFirebase,
  getFirestore,
  getFirebaseApp,
  COLLECTIONS,
  FirestoreHelpers,
};
