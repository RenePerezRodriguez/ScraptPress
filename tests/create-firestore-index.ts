/**
 * Script para generar el link de creación de índice compuesto en Firestore
 * Este script ejecutará una query que requiere un índice compuesto
 * y Firestore devolverá un link para crearlo automáticamente
 */

import * as admin from 'firebase-admin';
import path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const COLLECTIONS = {
  VEHICLES: 'copart_vehicles',
};

async function createIndexLink() {
  try {
    console.log('🔥 Initializing Firebase Admin...');
    
    // Initialize Firebase Admin (same as main app)
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 
      path.join(__dirname, '../studio-6719476275-3891a-firebase-adminsdk-fbsvc-c0dfeef39f.json');

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountPath),
      projectId: 'studio-6719476275-3891a',
    });

    const db = admin.firestore();
    console.log('✅ Connected to Firestore');

    console.log('\n📊 Attempting query that requires composite index...');
    console.log('Collection:', COLLECTIONS.VEHICLES);
    console.log('Query: search_tokens array-contains-any ["tesla"] + orderBy updated_at desc');

    // Esta query REQUIERE un índice compuesto
    const query = db.collection(COLLECTIONS.VEHICLES)
      .where('search_tokens', 'array-contains-any', ['tesla'])
      .orderBy('updated_at', 'desc')
      .limit(10);

    console.log('\n⏳ Executing query...');
    const snapshot = await query.get();

    console.log(`\n✅ Query successful! Found ${snapshot.size} documents`);
    console.log('⚠️ This means the index already exists OR Firestore auto-created it');

  } catch (error: any) {
    console.error('\n❌ Query failed (expected):', error.message);
    
    if (error.message && error.message.includes('index')) {
      console.log('\n🎯 INDEX CREATION REQUIRED!');
      console.log('Firestore needs a composite index for this query.');
      
      // Extract the index creation link from the error message
      const urlMatch = error.message.match(/https:\/\/console\.firebase\.google\.com\/[^\s]+/);
      
      if (urlMatch) {
        console.log('\n📋 CLICK THIS LINK TO CREATE THE INDEX:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(urlMatch[0]);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\n📝 Required Index Configuration:');
        console.log('   Collection:   copart_vehicles');
        console.log('   Field 1:      search_tokens (Array)');
        console.log('   Field 2:      updated_at (Descending)');
        console.log('\n⏱️ After clicking the link and creating the index:');
        console.log('   1. It may take 5-10 minutes to build');
        console.log('   2. Re-run the cached search test');
        console.log('   3. Query time should drop from 1.5s to < 500ms');
      } else {
        console.log('\n⚠️ Could not extract index creation link from error');
        console.log('Full error message:');
        console.log(error.message);
      }
    } else {
      console.log('\n⚠️ Unexpected error (not index-related)');
      console.log('Error details:', error);
    }
  }

  process.exit(0);
}

createIndexLink();
