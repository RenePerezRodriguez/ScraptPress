import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

// Initialize Firebase Admin
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(process.cwd(), 'config', 'credentials', 'studio-6719476275-3891a-firebase-adminsdk-fbsvc-c0dfeef39f.json');

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function queryFirestoreCollections() {
    console.log('🔍 Consultando Firestore...\n');

    // 1. Colección "searches"
    console.log('📁 Colección: searches\n');
    const searchesSnapshot = await db.collection('searches').limit(5).get();

    if (searchesSnapshot.empty) {
        console.log('   ⚠️ No hay documentos en "searches"\n');
    } else {
        for (const doc of searchesSnapshot.docs) {
            console.log(`   📄 Query: "${doc.id}"`);

            // Ver sub-colección "cache"
            const cacheSnapshot = await db.collection('searches').doc(doc.id).collection('cache').limit(3).get();
            cacheSnapshot.forEach(cacheDoc => {
                const data = cacheDoc.data();
                console.log(`      ├── Cache: ${cacheDoc.id} (${data.metadata?.size || 0} vehicles)`);
            });
            console.log('');
        }
    }

    // 2. Colección "copart_vehicles"
    console.log('📁 Colección: copart_vehicles\n');
    const vehiclesSnapshot = await db.collection('copart_vehicles').limit(5).get();

    if (vehiclesSnapshot.empty) {
        console.log('   ⚠️ No hay documentos en "copart_vehicles"\n');
    } else {
        console.log(`   ✅ Total documentos (sample): ${vehiclesSnapshot.size}`);
        vehiclesSnapshot.forEach(doc => {
            const data = doc.data();
            console.log(`   📄 Lot: ${doc.id} → ${data.year} ${data.make} ${data.model}`);
        });
        console.log('');
    }

    // Count total
    const totalVehicles = await db.collection('copart_vehicles').count().get();
    console.log(`📊 Total vehículos en Firestore: ${totalVehicles.data().count}\n`);
}

queryFirestoreCollections()
    .then(() => {
        console.log('✅ Consulta completada');
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ Error:', error);
        process.exit(1);
    });
