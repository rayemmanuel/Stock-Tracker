// Warmup script for Render deployment
// Run this BEFORE k6 cloud test!

const axios = require('axios');

const BASE_URL = 'https://stock-tracker-d4ye.onrender.com';

async function warmup() {
  console.log('\n🔥 WARMING UP RENDER DEPLOYMENT\n');
  console.log(`Target: ${BASE_URL}\n`);
  
  // Step 1: Wake up the server (Render free tier sleeps!)
  console.log('Step 1: Waking up Render server...');
  console.log('⏰ This may take up to 30 seconds on free tier...\n');
  
  try {
    const start = Date.now();
    await axios.get(`${BASE_URL}/`, { timeout: 60000 });
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`✓ Server awake! (took ${duration}s)\n`);
    await new Promise(r => setTimeout(r, 2000));
  } catch (error) {
    console.error('✗ Cannot reach server!');
    console.error(`  Error: ${error.message}`);
    console.error(`  Make sure your site is deployed at ${BASE_URL}\n`);
    process.exit(1);
  }
  
  // Step 2: Check health
  console.log('Step 2: Checking server health...');
  try {
    const res = await axios.get(`${BASE_URL}/api/health`, { timeout: 10000 });
    console.log('✓ Server is healthy');
    console.log(`  Status: ${res.data.status}`);
    console.log(`  Cache size: ${res.data.cacheSize}`);
    console.log(`  Queue size: ${res.data.queueSize}\n`);
  } catch (error) {
    console.error('⚠ Health check failed:', error.message);
    console.error('Continuing anyway...\n');
  }
  
  // Step 3: Pre-load stocks into cache
  console.log('Step 3: Loading stocks into cache...');
  const stocks = ['TSLA', 'AAPL', 'GOOGL'];
  
  for (const symbol of stocks) {
    try {
      console.log(`  Loading ${symbol}...`);
      const res = await axios.get(`${BASE_URL}/api/stock/${symbol}`, { timeout: 15000 });
      
      if (res.data._mock) {
        console.log(`  ⚠ ${symbol}: Mock data (API limited)`);
      } else {
        console.log(`  ✓ ${symbol}: $${res.data.price} (${res.data.changePercent})`);
      }
      
      await new Promise(r => setTimeout(r, 2000)); // Wait 2s between requests
    } catch (error) {
      console.error(`  ✗ ${symbol}: Failed - ${error.response?.status || error.message}`);
    }
  }
  
  // Step 4: Verify cache
  console.log('\nStep 4: Verifying cache...');
  try {
    const res = await axios.get(`${BASE_URL}/api/health`, { timeout: 10000 });
    console.log(`✓ Cache size: ${res.data.cacheSize}`);
    
    if (res.data.cacheSize >= 3) {
      console.log('✅ All stocks loaded successfully!\n');
    } else if (res.data.cacheSize > 0) {
      console.log(`⚠ Only ${res.data.cacheSize}/3 stocks cached\n`);
    } else {
      console.log('⚠ Cache is empty - API may be rate limited\n');
    }
  } catch (error) {
    console.log('⚠ Could not verify cache\n');
  }
  
  console.log('='.repeat(60));
  console.log('🚀 WARMUP COMPLETE! Run k6 test NOW!');
  console.log('='.repeat(60));
  console.log('\nCommands:\n');
  console.log('Local k6:');
  console.log('  k6 run k6-render-test.js\n');
  console.log('k6 Cloud:');
  console.log('  k6 cloud k6-render-test.js\n');
  console.log('⏰ Cache expires in 5 minutes - run test immediately!\n');
}

warmup().catch(error => {
  console.error('\n❌ Warmup failed:', error.message);
  process.exit(1);
});