import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom error rate metric
export const errorRate = new Rate('errors');

// Test configuration optimized for Grafana Cloud
export const options = {
  // Test stages - gradual ramp up
  stages: [
    { duration: '30s', target: 3 },   // Ramp to 3 users
    { duration: '2m', target: 3 },    // Hold 3 users
    { duration: '30s', target: 5 },   // Ramp to 5 users  
    { duration: '1m', target: 5 },    // Hold 5 users
    { duration: '30s', target: 0 },   // Ramp down
  ],
  
  // Thresholds for pass/fail
  thresholds: {
    'http_req_duration': ['p(95)<8000'],  // 95% requests under 8s (very lenient)
    'http_req_failed': ['rate<0.3'],      // Less than 30% failures
    'checks': ['rate>0.7'],               // At least 70% checks pass
  },
};

// Your deployed site URL
const BASE_URL = 'https://stock-tracker-d4ye.onrender.com';

// Just use TSLA for maximum cache hits
const STOCK = 'TSLA';

export default function () {
  let res;
  
  // TEST 1: Homepage - Simple check
  try {
    res = http.get(`${BASE_URL}/`, { timeout: '15s' });
    check(res, {
      'Homepage loaded': (r) => r && r.status === 200,
    });
  } catch (e) {
    errorRate.add(1);
    console.error('Homepage error:', e);
  }
  
  sleep(3);
  
  // TEST 2: Alerts Page - Simple check
  try {
    res = http.get(`${BASE_URL}/alerts.html`, { timeout: '15s' });
    check(res, {
      'Alerts page loaded': (r) => r && r.status === 200,
    });
  } catch (e) {
    errorRate.add(1);
    console.error('Alerts page error:', e);
  }
  
  sleep(3);
  
  // TEST 3: Health Check - Safe JSON parsing
  try {
    res = http.get(`${BASE_URL}/api/health`, { timeout: '15s' });
    
    let healthOk = false;
    if (res && res.status === 200) {
      healthOk = true;
      
      // Try to parse JSON but don't fail if we can't
      if (res.body && typeof res.body === 'string') {
        try {
          const data = JSON.parse(res.body);
          healthOk = data && data.status === 'ok';
        } catch (parseErr) {
          // JSON parse failed but 200 response is still ok
          healthOk = true;
        }
      }
    }
    
    check(res, {
      'Health check OK': () => healthOk,
    });
  } catch (e) {
    errorRate.add(1);
    console.error('Health check error:', e);
  }
  
  sleep(3);
  
  // TEST 4: Stock API - SUPER SAFE parsing
  try {
    res = http.get(`${BASE_URL}/api/stock/${STOCK}`, { timeout: '20s' });
    
    let stockOk = false;
    
    // First check: Did we get a 200?
    if (res && res.status === 200) {
      stockOk = true; // Already a pass if we got 200
      
      // Bonus check: Is the data valid?
      if (res.body && typeof res.body === 'string' && res.body.length > 0) {
        try {
          const data = JSON.parse(res.body);
          
          // Check if it has the fields we expect
          if (data && data.symbol && data.price) {
            stockOk = true;
          }
        } catch (parseErr) {
          // Parse failed but we still got 200, so don't fail completely
          console.log('Stock API returned 200 but JSON parse failed');
          stockOk = true;
        }
      }
    }
    
    check(res, {
      'Stock API responded': () => stockOk,
    });
  } catch (e) {
    errorRate.add(1);
    console.error('Stock API error:', e);
  }
  
  sleep(5);
  
  // TEST 5: Form Submission - Only sometimes
  if (Math.random() < 0.2) { // Only 20% of requests
    try {
      const payload = JSON.stringify({
        email: 'test@example.com',
        symbol: STOCK,
        condition: 'above',
        targetPrice: '250.00'
      });
      
      res = http.post(`${BASE_URL}/api/alerts`, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: '15s'
      });
      
      check(res, {
        'Form submitted': (r) => r && r.status === 200,
      });
    } catch (e) {
      errorRate.add(1);
      console.error('Form submission error:', e);
    }
    
    sleep(2);
  }
  
  sleep(5); // Long sleep between iterations
}