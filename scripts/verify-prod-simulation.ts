
import axios from 'axios';

const baseUrl = 'http://localhost:3000';
const query = 'Mustang ProdTest Node';

// Colors for console
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

async function run() {
    console.log(cyan('🚀 Starting Production Simulation Test (Node.js)'));
    console.log(`Target: ${baseUrl}`);

    try {
        // 1. Health
        try {
            const heatlh = await axios.get(`${baseUrl}/api/health`);
            console.log(green(`✅ Health Check Passed: ${heatlh.data.status}`));
        } catch (e: any) {
            console.log(yellow('⚠️ Health Check Warning (Proceeding):'));
            if (e.response) {
                console.log(JSON.stringify(e.response.data, null, 2));
            } else {
                console.log(e.message);
            }
        }

        // 2. First Search
        console.log(yellow('\n🔍 Step 1: Performing Live Search (Should take ~15-20s)...'));
        const start1 = Date.now();
        try {
            const res1 = await axios.get(`${baseUrl}/api/search/vehicles`, {
                params: { query, page: 1, limit: 10 },
                headers: { 'X-API-Key': '94049b42b2b4d1cac6d0754d880eb4ef' }
            });
            const dur1 = (Date.now() - start1) / 1000;
            console.log(`⏱️ Time 1: ${dur1.toFixed(2)}s`);

            if (res1.data.success) {
                console.log(green(`✅ Search 1 Successful. Found ${res1.data.returned} vehicles.`));
                console.log(`SOURCE: ${res1.data.source}`);
            } else {
                console.log(red('❌ Search 1 Failed (Business Logic).'));
            }
        } catch (err: any) {
            console.log(red(`❌ Search 1 Error: ${err.message}`));
            if (err.response) {
                console.log(`Status: ${err.response.status}`);
                console.log(JSON.stringify(err.response.data));
            }
            // process.exit(1); // Do not exit, try cache step anyway
        }

        // Wait for Sync
        console.log(yellow('\n⏳ Waiting 5 seconds for background sync...'));
        await new Promise(r => setTimeout(r, 5000));

        // 3. Cached Search
        console.log(cyan('\n⚡ Step 2: Performing Cached Search (Should be < 0.2s)...'));
        const start2 = Date.now();
        try {
            const res2 = await axios.get(`${baseUrl}/api/search/vehicles`, {
                params: { query, page: 1, limit: 10 },
                headers: { 'X-API-Key': '94049b42b2b4d1cac6d0754d880eb4ef' }
            });
            const dur2 = (Date.now() - start2); // ms
            console.log(`⏱️ Time 2: ${dur2} ms`);

            if (res2.data.success) {
                console.log(`SOURCE: ${res2.data.source}`);
                if (res2.data.source === 'redis' || res2.data.source === 'cache') {
                    console.log(green('✅ CACHE VERIFIED!'));
                } else {
                    console.log(yellow(`⚠️ WARNING: Source was ${res2.data.source} (Expected 'redis' or 'cache')`));
                }
            }
        } catch (err: any) {
            console.log(red(`❌ Search 2 Error: ${err.message}`));
        }

    } catch (err: any) {
        console.error(red('❌ Test Failed with unexpected error:'), err.message);
    }
}

run();
