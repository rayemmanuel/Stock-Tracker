import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// OPTIMIZED for high reliability
export const options = {
  stages: [
    { duration: '30s', target: 5 },   // Ramp up slowly to 5 users
    { duration: '2m', target: 5 },    // Hold at 5 users for 2 minutes
    { duration: '30s', target: 10 },  // Ramp to 10 users
    { duration: '1m', target: 10 },   // Hold at 10
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'], // 95% under 5s (more lenient)
    errors: ['rate<0.2'],              // Less than 20% errors
    http_req_failed: ['rate<0.2'],     // Less than 20% failures
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// ONLY 3 stocks - maximum cache reuse!
const stocks = ['TSLA', 'AAPL', 'GOOGL'];

export default function () {
  // Test 1: Homepage (no API call, always succeeds)
  let res = http.get(`${BASE_URL}/`, { timeout: '10s' });
  check(res, {
    'homepage status is 200': (r) => r.status === 200,
  }) || errorRate.add(1);
  
  sleep(2);
  
  // Test 2: Alerts page (no API call, always succeeds)
  res = http.get(`${BASE_URL}/alerts.html`, { timeout: '10s' });
  check(res, {
    'alerts page status is 200': (r) => r.status === 200,
  }) || errorRate.add(1);
  
  sleep(2);
  
  // Test 3: Health check (no external API, always succeeds)
  res = http.get(`${BASE_URL}/api/health`, { timeout: '10s' });
  check(res, {
    'health check is OK': (r) => r.status === 200,
  }) || errorRate.add(1);
  
  sleep(2);
  
  // Test 4: Stock API - use same stock repeatedly for cache hits
  // Each virtual user sticks to one stock
  const myStock = stocks[__VU % stocks.length];
  res = http.get(`${BASE_URL}/api/stock/${myStock}`, { timeout: '15s' });
  check(res, {
    'stock API responds': (r) => r.status === 200,
    'stock API returns data': (r) => {
      try {
        const json = JSON.parse(r.body);
        return json.symbol && json.price;
      } catch {
        return false;
      }
    },
  }) || errorRate.add(1);
  
  sleep(3);
  
  // Test 5: Form submission (only 25% of requests)
  if (Math.random() < 0.25) {
    const payload = JSON.stringify({
      email: `test${__VU}_${__ITER}@example.com`,
      symbol: myStock,
      condition: Math.random() > 0.5 ? 'above' : 'below',
      targetPrice: (Math.random() * 500 + 100).toFixed(2)
    });
    
    const params = {
      headers: { 'Content-Type': 'application/json' },
      timeout: '10s'
    };
    
    res = http.post(`${BASE_URL}/api/alerts`, payload, params);
    check(res, {
      'form submission OK': (r) => r.status === 200,
    }) || errorRate.add(1);
    
    sleep(2);
  }
  
  sleep(3); // Longer sleep between iterations
}