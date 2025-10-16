import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up to 10 users
    { duration: '1m', target: 10 },   // Stay at 10 users
    { duration: '30s', target: 20 },  // Ramp up to 20 users
    { duration: '1m', target: 20 },   // Stay at 20 users
    { duration: '30s', target: 0 },   // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests should be below 2s
    errors: ['rate<0.1'],              // Error rate should be below 10%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const stocks = ['TSLA', 'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'META'];

export default function () {
  // Test 1: Homepage
  let res = http.get(`${BASE_URL}/`);
  check(res, {
    'homepage status is 200': (r) => r.status === 200,
    'homepage loads in <2s': (r) => r.timings.duration < 2000,
  }) || errorRate.add(1);
  
  sleep(1);
  
  // Test 2: Watchlist page
  res = http.get(`${BASE_URL}/watchlist.html`);
  check(res, {
    'watchlist page status is 200': (r) => r.status === 200,
  }) || errorRate.add(1);
  
  sleep(1);
  
  // Test 3: Stock API (random stock from list)
  const randomStock = stocks[Math.floor(Math.random() * stocks.length)];
  res = http.get(`${BASE_URL}/api/stock/${randomStock}`);
  check(res, {
    'stock API status is 200': (r) => r.status === 200,
    'stock API returns valid JSON': (r) => {
      try {
        const json = JSON.parse(r.body);
        return json.symbol && json.price;
      } catch {
        return false;
      }
    },
  }) || errorRate.add(1);
  
  sleep(1);
  
  // Test 4: Form submission (every 5th user)
  if (__VU % 5 === 0) {
    const payload = JSON.stringify({
      name: `Test User ${__VU}`,
      email: `test${__VU}@example.com`,
      stocks: 'TSLA, AAPL',
      frequency: 'daily'
    });
    
    const params = {
      headers: { 'Content-Type': 'application/json' },
    };
    
    res = http.post(`${BASE_URL}/api/watchlist`, payload, params);
    check(res, {
      'form submission status is 200': (r) => r.status === 200,
      'form returns success': (r) => {
        try {
          const json = JSON.parse(r.body);
          return json.success === true;
        } catch {
          return false;
        }
      },
    }) || errorRate.add(1);
  }
  
  sleep(2);
  
  // Test 5: Health check
  res = http.get(`${BASE_URL}/api/health`);
  check(res, {
    'health check is OK': (r) => r.status === 200,
  }) || errorRate.add(1);
  
  sleep(1);
}