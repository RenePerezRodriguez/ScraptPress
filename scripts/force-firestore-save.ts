import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

async function forceFirestoreSave() {
    const API_KEY = process.env.API_KEY;
    const BASE_URL = 'http://localhost:3000';

    if (!API_KEY) {
        console.error('❌ API_KEY no encontrada en .env');
        process.exit(1);
    }

    console.log('🔥 Forzando búsqueda NUEVA para guardar en Firestore...\n');

    try {
        // Hacer búsqueda completamente nueva (sin cache)
        const query = 'honda'; // Diferente query para evitar cache
        const response = await axios.get(`${BASE_URL}/api/search/vehicles`, {
            params: {
                query,
                page: 1,
                limit: 10,
            },
            headers: {
                'X-API-Key': API_KEY,
            },
            timeout: 120000, // 2 minutos
        });

        console.log('✅ Búsqueda completada');
        console.log(`📊 Source: ${response.data.source}`);
        console.log(`📦 Vehículos: ${response.data.returned}`);
        console.log(`📄 Query: ${response.data.query}`);
        console.log(`📄 Page: ${response.data.page}`);
        console.log(`📄 Limit: ${response.data.limit}`);

        console.log('\n✅ Ahora revisa Firestore Console:');
        console.log(`   Colección: searches/${query}/cache/1-10`);
    } catch (error: any) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Response:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

forceFirestoreSave();
