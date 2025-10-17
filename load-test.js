import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// AGGRESSIVE Test configuration - server now handles this!
export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up to 10 users
    { duration: '1m', target: 10 },   // Stay at 10 users
    { duration: '30s', target: 20 },  // Ramp up to 20 users
    { duration: '1m', target: 20 },   // Stay at 20 users
    { duration: '30s', target: 0 },   // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'], // 95% of requests should be below 3s
    errors: ['rate<0.15'],             // Error rate should be below 15%
    http_req_failed: ['rate<0.15'],    // Failed requests should be below 15%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const stocks = ['TSLA', 'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'META'];

export default function () {
  // Test 1: Homepage
  let res = http.get(`${BASE_URL}/`);
  check(res, {
    'homepage status is 200': (r) => r.status === 200,
    'homepage loads in <3s': (r) => r.timings.duration < 3000,
  }) || errorRate.add(1);
  
  sleep(1);
  
  // Test 2: Alerts page
  res = http.get(`${BASE_URL}/alerts.html`);
  check(res, {
    'alerts page status is 200': (r) => r.status === 200,
  }) || errorRate.add(1);
  
  sleep(1);
  
  // Test 3: Stock API - rate limiting on server handles this
  const randomStock = stocks[Math.floor(Math.random() * stocks.length)];
  res = http.get(`${BASE_URL}/api/stock/${randomStock}`);
  check(res, {
    'stock API responds': (r) => r.status === 200 || r.status === 404,
    'stock API returns valid JSON': (r) => {
      try {
        const json = JSON.parse(r.body);
        return json.symbol || json.error;
      } catch {
        return false;
      }
    },
  }) || errorRate.add(1);
  
  sleep(1);
  
  // Test 4: Alert form submission
  if (__VU % 3 === 0) {
    const payload = JSON.stringify({
      email: `test${__VU}@example.com`,
      symbol: randomStock,
      condition: Math.random() > 0.5 ? 'above' : 'below',
      targetPrice: (Math.random() * 500 + 100).toFixed(2)
    });
    
    const params = {
      headers: { 'Content-Type': 'application/json' },
    };
    
    res = http.post(`${BASE_URL}/api/alerts`, payload, params);
    check(res, {
      'alert submission status is 200': (r) => r.status === 200,
      'alert returns success': (r) => {
        try {
          const json = JSON.parse(r.body);
          return json.success === true;
        } catch {
          return false;
        }
      },
    }) || errorRate.add(1);
  }
  
  sleep(1);
  
  // Test 5: Health check
  res = http.get(`${BASE_URL}/api/health`);
  check(res, {
    'health check is OK': (r) => r.status === 200,
  }) || errorRate.add(1);
  
  sleep(1);
}