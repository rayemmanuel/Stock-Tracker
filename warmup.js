// Warm-up script to pre-load cache before k6 testing
// Run this BEFORE your k6 test for best results

const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const stocks = ['TSLA', 'AAPL', 'GOOGL'];

async function warmup() {
  console.log('🔥 Starting cache warm-up...\n');
  console.log(`Target: ${BASE_URL}\n`);
  
  // Test server health
  try {
    const health = await axios.get(`${BASE_URL}/api/health`);
    console.log('✓ Server is healthy');
    console.log(`  Status: ${health.data.status}`);
    console.log(`  Queue size: ${health.data.queueSize}`);
    console.log(`  Cache size: ${health.data.cacheSize}\n`);
  } catch (error) {
    console.error('✗ Server health check failed!');
    console.error(`  Error: ${error.message}\n`);
    process.exit(1);
  }
  
  // Load pages
  console.log('Loading pages...');
  try {
    await axios.get(`${BASE_URL}/`);
    console.log('✓ Homepage loaded');
    
    await axios.get(`${BASE_URL}/alerts.html`);
    console.log('✓ Alerts page loaded\n');
  } catch (error) {
    console.error('✗ Failed to load pages');
  }
  
  // Pre-load stock data into cache
  console.log('Pre-loading stock data into cache...');
  
  for (const symbol of stocks) {
    try {
      const response = await axios.get(`${BASE_URL}/api/stock/${symbol}`);
      const data = response.data;
      
      if (data._mock) {
        console.log(`⚠ ${symbol}: Using mock data (API might be limited)`);
      } else {
        console.log(`✓ ${symbol}: $${data.price} (${data.changePercent})`);
      }
      
      // Wait a bit between requests
      await new Promise(r => setTimeout(r, 1500));
    } catch (error) {
      console.error(`✗ ${symbol}: Failed - ${error.message}`);
    }
  }
  
  // Check cache status
  console.log('\nChecking cache status...');
  try {
    const health = await axios.get(`${BASE_URL}/api/health`);
    console.log(`✓ Cache now has ${health.data.cacheSize} entries`);
    console.log(`✓ Queue size: ${health.data.queueSize}\n`);
  } catch (error) {
    console.error('✗ Failed to check cache status\n');
  }
  
  console.log('🎉 Warm-up complete! Cache is ready.');
  console.log('You can now run your k6 test:\n');
  console.log(`   k6 run --env BASE_URL=${BASE_URL} load-test.js\n`);
}

// Run warm-up
warmup().catch(error => {
  console.error('Warm-up failed:', error.message);
  process.exit(1);
});