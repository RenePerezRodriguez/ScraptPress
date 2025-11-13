/**
 * Check McLaren vehicle search tokens in Firestore
 */

import { getFirestore, COLLECTIONS } from '../src/config/firebase';

async function checkMcLarenTokens() {
  try {
    const db = getFirestore();
    
    console.log('🔍 Searching for any McLaren vehicles in Firestore...');
    
    // Get all vehicles to find McLaren
    const snapshot = await db.collection(COLLECTIONS.VEHICLES)
      .limit(100)
      .get();
    
    console.log(`Found ${snapshot.size} total vehicles in Firestore`);
    
    const mclarenVehicles: any[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.make?.toLowerCase().includes('mclaren')) {
        mclarenVehicles.push({
          lot_number: data.lot_number,
          make: data.make,
          model: data.model,
          search_tokens: data.search_tokens
        });
      }
    });
    
    console.log(`\n📊 Found ${mclarenVehicles.length} McLaren vehicles:`);
    mclarenVehicles.forEach(v => {
      console.log(`\nLot: ${v.lot_number}`);
      console.log(`Make: ${v.make}`);
      console.log(`Model: ${v.model}`);
      console.log(`Tokens: ${JSON.stringify(v.search_tokens)}`);
    });
    
    // Test query
    console.log(`\n🧪 Testing query with array-contains-any ["mclaren"]...`);
    const querySnapshot = await db.collection(COLLECTIONS.VEHICLES)
      .where('search_tokens', 'array-contains-any', ['mclaren'])
      .limit(5)
      .get();
    
    console.log(`Query result: ${querySnapshot.size} documents`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkMcLarenTokens();
