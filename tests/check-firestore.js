const admin = require('firebase-admin');
const serviceAccount = require('../config/credentials/studio-6719476275-3891a-firebase-adminsdk-fbsvc-c0dfeef39f.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkCache() {
  try {
    // Get query from command line argument, default to 'honda'
    const query = process.argv[2] || 'honda';
    
    console.log(`\n=== Checking Firestore Cache for "${query}" ===\n`);
    
    const snapshot = await db.collection('searches').doc(query).collection('cache').get();
    
    console.log(`Total documents: ${snapshot.size}\n`);
    
    snapshot.forEach(doc => {
      const data = doc.data();
      console.log(`Document ID: ${doc.id}`);
      console.log(`  Vehicles: ${data.vehicles?.length || 0}`);
      console.log(`  Timestamp: ${data.timestamp?.toDate()}`);
      console.log(`  Source: ${data.metadata?.source || 'N/A'}`);
      
      if (data.vehicles?.length > 0) {
        const v = data.vehicles[0];
        console.log(`  First vehicle:`);
        console.log(`    Lot: ${v.lotNumber}`);
        console.log(`    VIN: ${v.vin || 'N/A'}`);
        console.log(`    Has assessment: ${!!v.assessment}`);
        console.log(`    Has details: ${!!v.details}`);
        console.log(`    Has features: ${!!v.features}`);
        console.log(`    Has safety: ${!!v.safety}`);
      }
      console.log('');
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkCache();
