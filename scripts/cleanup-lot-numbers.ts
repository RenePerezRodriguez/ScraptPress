/**
 * Script to cleanup lot numbers from Firestore
 * Run: npx ts-node scripts/cleanup-lot-numbers.ts
 */

import { getFirestore } from '../src/config/firebase';
import * as readline from 'readline';

async function cleanup() {
  try {
    const db = getFirestore();
    
    console.log('\n🧹 LIMPIEZA DE LOT NUMBERS EN FIRESTORE');
    console.log('=' .repeat(80));
    
    // Get all documents in searches collection
    const searchesSnapshot = await db.collection('searches').get();
    
    // Find lot numbers
    const lotNumbers: string[] = [];
    
    for (const doc of searchesSnapshot.docs) {
      const docId = doc.id;
      
      if (/^\d+$/.test(docId)) {
        lotNumbers.push(docId);
      }
    }
    
    if (lotNumbers.length === 0) {
      console.log('\n✅ No hay lot numbers para eliminar. Estructura correcta.');
      console.log('\n' + '='.repeat(80) + '\n');
      return;
    }
    
    console.log(`\n⚠️  Se encontraron ${lotNumbers.length} lot numbers que deben ser eliminados:\n`);
    
    for (const lotId of lotNumbers.sort()) {
      const docRef = db.collection('searches').doc(lotId);
      const cacheSnapshot = await docRef.collection('cache').get();
      console.log(`   • ${lotId} (${cacheSnapshot.size} páginas en cache)`);
    }
    
    // Ask for confirmation
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise<string>((resolve) => {
      rl.question('\n❓ ¿Deseas eliminar estos documentos? (si/no): ', resolve);
    });
    
    rl.close();
    
    if (answer.toLowerCase() !== 'si' && answer.toLowerCase() !== 'yes') {
      console.log('\n❌ Operación cancelada por el usuario.');
      return;
    }
    
    console.log('\n🗑️  Eliminando lot numbers...\n');
    
    let deletedCount = 0;
    
    for (const lotId of lotNumbers) {
      try {
        const docRef = db.collection('searches').doc(lotId);
        
        // Delete cache subcollection first
        const cacheSnapshot = await docRef.collection('cache').get();
        const batch = db.batch();
        
        cacheSnapshot.forEach((doc) => {
          batch.delete(doc.ref);
        });
        
        await batch.commit();
        
        // Delete main document
        await docRef.delete();
        
        deletedCount++;
        console.log(`   ✅ Eliminado: ${lotId} (${cacheSnapshot.size} páginas)`);
      } catch (error) {
        console.error(`   ❌ Error eliminando ${lotId}:`, error);
      }
    }
    
    console.log(`\n✅ Limpieza completada: ${deletedCount}/${lotNumbers.length} documentos eliminados`);
    console.log('\n' + '='.repeat(80) + '\n');
    
  } catch (error) {
    console.error('❌ Error en la limpieza:', error);
    process.exit(1);
  }
}

// Run
cleanup()
  .then(() => {
    console.log('✅ Script completado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
