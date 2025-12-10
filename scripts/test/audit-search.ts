import { CopartPlatform } from '../../src/services/scrapers/platforms/copart/copart.platform';
import { Logger } from '../../src/config/logger';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env vars
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Mock logger to print to console
const logger = Logger.getInstance();
logger.info = console.log;
logger.warn = console.warn;
logger.error = console.error;
logger.debug = console.debug;

async function auditSearch() {
  console.log('🚀 Starting Visual Search Audit (Headless: FALSE)...');
  console.log('👀 A browser window should open shortly.');

  // Initialize platform directly to control config
  const platform = new CopartPlatform({
    headless: false, // VISUAL MODE
    debug: true
  });

  const query = 'Toyota Camry 2020';
  const limit = 5;

  console.log(`\n🔍 Searching for: "${query}" (Limit: ${limit})`);

  // Construct URL
  const searchUrl = `https://www.copart.com/lotSearchResults?free=true&query=${encodeURIComponent(query)}`;

  const startTime = Date.now();

  try {
    const results = await platform.scrape(
      searchUrl,
      limit,
      (payload) => console.log(`[${payload.level.toUpperCase()}] ${payload.msg}`),
      1, // page
      limit
    );

    const duration = (Date.now() - startTime) / 1000;

    console.log('\n📊 Audit Results:');
    console.log(`- Vehicles Found: ${results.length}`);
    console.log(`- Total Duration: ${duration}s`);

    if (results.length > 0) {
      console.log('✅ First vehicle:', results[0].year, results[0].make, results[0].vehicle_model);
    } else {
      console.error('❌ No vehicles returned despite visual confirmation?');
    }

  } catch (error) {
    console.error('❌ Audit Failed:', error);
  } finally {
    // Keep browser open for a moment if user wants to see
    // await new Promise(r => setTimeout(r, 5000));
    // process.exit(0);
  }
}

if (!process.env.GEMINI_API_KEY) {
  console.warn('⚠️ GEMINI_API_KEY is NOT set!');
} else {
  console.log('✅ GEMINI_API_KEY is set.');
}

auditSearch();
