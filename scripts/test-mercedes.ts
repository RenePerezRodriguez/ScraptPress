import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

async function testMercedesSearch() {
  const API_KEY = process.env.API_KEY;
  const BASE_URL = 'http://localhost:3000';

  if (!API_KEY) {
    console.error('❌ API_KEY not found');
    process.exit(1);
  }

  console.log('🔍 Testing Mercedes search (10 vehicles)...\n');

  try {
    const start = Date.now();
    const response = await axios.get(`${BASE_URL}/api/search/vehicles`, {
      params: {
        query: 'mercedes',
        page: 1,
        limit: 10,
      },
      headers: {
        'X-API-Key': API_KEY,
      },
      timeout: 120000,
    });

    const duration = ((Date.now() - start) / 1000).toFixed(2);

    console.log('✅ Search completed');
    console.log(`📊 Source: ${response.data.source}`);
    console.log(`📦 Vehicles returned: ${response.data.returned}`);
    console.log(`⏱️ Total time: ${duration}s`);
    console.log(`🔄 Cached: ${response.data.cached ? 'Yes' : 'No'}`);
    
    if (response.data.vehicles && response.data.vehicles.length > 0) {
      const first = response.data.vehicles[0];
      console.log(`\n🚗 First result: ${first.year} ${first.make} ${first.model}`);
      console.log(`   Lot: ${first.lot_number}`);
      console.log(`   Bid: ${first.current_bid}`);
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    process.exit(1);
  }
}

testMercedesSearch();
