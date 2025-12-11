/**
 * Script to check Firestore structure
 * Run: npx ts-node scripts/check-firestore-structure.ts
 */

import { getFirestore } from '../src/config/firebase';

async function checkFirestoreStructure() {
  try {
    const db = getFirestore();
    
    console.log('\n📊 ESTRUCTURA ACTUAL DE FIRESTORE');
    console.log('=' .repeat(80));
    console.log('\nsearches/ (colección raíz)');
    
    // Get all documents in searches collection
    const searchesSnapshot = await db.collection('searches').get();
    
    console.log(`\n✅ Total de documentos: ${searchesSnapshot.size}\n`);
    
    // Separate into queries and lot numbers
    const queries: string[] = [];
    const lotNumbers: string[] = [];
    
    for (const doc of searchesSnapshot.docs) {
      const docId = doc.id;
      
      if (/^\d+$/.test(docId)) {
        lotNumbers.push(docId);
      } else {
        queries.push(docId);
      }
    }
    
    // Show queries (valid search terms)
    if (queries.length > 0) {
      console.log('✅ QUERIES DE BÚSQUEDA (VÁLIDOS):');
      console.log('─'.repeat(80));
      
      for (const queryId of queries.sort()) {
        const docRef = db.collection('searches').doc(queryId);
        const docData = await docRef.get();
        const metadata = docData.data()?.metadata;
        
        console.log(`\n  📁 ${queryId}/`);
        console.log(`     ├─ metadata:`);
        console.log(`     │   ├─ query: "${metadata?.query || 'N/A'}"`);
        console.log(`     │   ├─ searchCount: ${metadata?.searchCount || 0}`);
        console.log(`     │   ├─ createdAt: ${metadata?.createdAt?.toDate().toLocaleString('es-ES') || 'N/A'}`);
        console.log(`     │   └─ lastUpdated: ${metadata?.lastUpdated?.toDate().toLocaleString('es-ES') || 'N/A'}`);
        
        // Get cache subcollection
        const cacheSnapshot = await docRef.collection('cache').get();
        
        if (cacheSnapshot.size > 0) {
          console.log(`     └─ cache/ (${cacheSnapshot.size} páginas)`);
          
          const cacheIds = cacheSnapshot.docs.map(d => d.id).sort();
          for (let i = 0; i < cacheIds.length; i++) {
            const isLast = i === cacheIds.length - 1;
            const prefix = isLast ? '        └─' : '        ├─';
            
            const cacheDoc = cacheSnapshot.docs.find(d => d.id === cacheIds[i]);
            const cacheData = cacheDoc?.data();
            const vehicleCount = cacheData?.vehicles?.length || 0;
            
            console.log(`${prefix} ${cacheIds[i]} (${vehicleCount} vehículos)`);
            
            // Show full cache document data
            if (cacheData) {
              const indent = isLast ? '           ' : '        │  ';
              console.log(`${indent}   ├─ totalPages: ${cacheData.totalPages || 0}`);
              console.log(`${indent}   ├─ currentPage: ${cacheData.currentPage || 0}`);
              console.log(`${indent}   ├─ limit: ${cacheData.limit || 0}`);
              console.log(`${indent}   ├─ totalResults: ${cacheData.totalResults || 0}`);
              console.log(`${indent}   ├─ scrapedAt: ${cacheData.scrapedAt?.toDate().toLocaleString('es-ES') || 'N/A'}`);
              console.log(`${indent}   ├─ expiresAt: ${cacheData.expiresAt?.toDate().toLocaleString('es-ES') || 'N/A'}`);
              console.log(`${indent}   └─ vehicles: ${vehicleCount} vehículos`);
              
              // Show first 2 vehicles as sample
              if (cacheData.vehicles && cacheData.vehicles.length > 0) {
                const samplesToShow = Math.min(2, cacheData.vehicles.length);
                console.log(`${indent}      Muestra de vehículos:`);
                
                for (let v = 0; v < samplesToShow; v++) {
                  const vehicle = cacheData.vehicles[v];
                  const isLastVehicle = v === samplesToShow - 1;
                  const vPrefix = isLastVehicle ? '└─' : '├─';
                  
                  console.log(`${indent}      ${vPrefix} [${v + 1}] Lot: ${vehicle.lotNumber || 'N/A'}, ${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`);
                }
                
                if (cacheData.vehicles.length > 2) {
                  console.log(`${indent}         ... y ${cacheData.vehicles.length - 2} vehículos más`);
                }
              }
            }
          }
        } else {
          console.log(`     └─ cache/ (vacío)`);
        }
      }
    }
    
    // Show lot numbers (invalid - should not exist)
    if (lotNumbers.length > 0) {
      console.log('\n\n❌ LOT NUMBERS (NO DEBERÍAN EXISTIR):');
      console.log('─'.repeat(80));
      console.log('⚠️  Estos documentos fueron creados por error y deben ser eliminados:\n');
      
      for (const lotId of lotNumbers.sort()) {
        const docRef = db.collection('searches').doc(lotId);
        const cacheSnapshot = await docRef.collection('cache').get();
        
        console.log(`  ❌ ${lotId}/ (${cacheSnapshot.size} páginas en cache)`);
      }
      
      console.log('\n💡 Solución: Eliminar estos documentos desde Firebase Console');
      console.log('   O ejecutar: npx ts-node scripts/cleanup-lot-numbers.ts');
    }
    
    // Summary
    console.log('\n\n📈 RESUMEN:');
    console.log('─'.repeat(80));
    console.log(`✅ Queries válidos: ${queries.length}`);
    console.log(`❌ Lot numbers (error): ${lotNumbers.length}`);
    console.log(`📊 Total documentos: ${searchesSnapshot.size}`);
    
    if (lotNumbers.length > 0) {
      console.log('\n⚠️  ACCIÓN REQUERIDA: Limpiar lot numbers de Firestore');
    } else {
      console.log('\n✅ Estructura correcta - sin lot numbers');
    }
    
    console.log('\n' + '='.repeat(80) + '\n');
    
  } catch (error) {
    console.error('❌ Error al revisar Firestore:', error);
    process.exit(1);
  }
}

// Run
checkFirestoreStructure()
  .then(() => {
    console.log('✅ Verificación completada');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
