const express = require('express');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// MULTI-LAYER CACHE SYSTEM
const cache = new Map();
const CACHE_DURATION = 300000; // 5 minutes (increased from 1 minute)
const STALE_CACHE_DURATION = 3600000; // 1 hour - serve stale data rather than fail

// AGGRESSIVE RATE LIMITING
const requestQueue = [];
const activeRequests = new Map();
let isProcessingQueue = false;
const MAX_REQUESTS_PER_MINUTE = 50; // Even more conservative
const REQUEST_INTERVAL = 60000 / MAX_REQUESTS_PER_MINUTE; // ~1200ms between requests
const MAX_QUEUE_SIZE = 100;

// Request tracking
let requestCount = 0;
let lastResetTime = Date.now();

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Reset request counter every minute
setInterval(() => {
  requestCount = 0;
  lastResetTime = Date.now();
}, 60000);

// Process queue with strict rate limiting
async function processQueue() {
  if (isProcessingQueue || requestQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  while (requestQueue.length > 0) {
    // Check if we've hit rate limit for this minute
    if (requestCount >= MAX_REQUESTS_PER_MINUTE) {
      const waitTime = 60000 - (Date.now() - lastResetTime);
      if (waitTime > 0) {
        console.log(`Rate limit reached. Waiting ${waitTime}ms...`);
        await new Promise(r => setTimeout(r, waitTime));
        requestCount = 0;
        lastResetTime = Date.now();
      }
    }
    
    const { symbol, resolve, reject } = requestQueue.shift();
    
    try {
      const API_KEY = process.env.FINNHUB_API_KEY;
      
      if (!API_KEY) {
        reject(new Error('API key not configured'));
        continue;
      }
      
      const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${API_KEY}`;
      const response = await axios.get(url, { timeout: 5000 });
      
      requestCount++;
      resolve(response.data);
      
      // Wait before next request
      if (requestQueue.length > 0) {
        await new Promise(r => setTimeout(r, REQUEST_INTERVAL));
      }
    } catch (error) {
      console.error(`API error for ${symbol}:`, error.message);
      reject(error);
    }
  }
  
  isProcessingQueue = false;
}

// Queue API request with timeout protection
function queueApiRequest(symbol, timeout = 10000) {
  return new Promise((resolve, reject) => {
    // Check if already in queue
    if (activeRequests.has(symbol)) {
      return activeRequests.get(symbol);
    }
    
    // Check queue size
    if (requestQueue.length >= MAX_QUEUE_SIZE) {
      return reject(new Error('Queue is full'));
    }
    
    const timeoutId = setTimeout(() => {
      reject(new Error('Request timeout'));
    }, timeout);
    
    const wrappedResolve = (data) => {
      clearTimeout(timeoutId);
      activeRequests.delete(symbol);
      resolve(data);
    };
    
    const wrappedReject = (error) => {
      clearTimeout(timeoutId);
      activeRequests.delete(symbol);
      reject(error);
    };
    
    const promise = { resolve: wrappedResolve, reject: wrappedReject };
    activeRequests.set(symbol, promise);
    requestQueue.push({ symbol, resolve: wrappedResolve, reject: wrappedReject });
    processQueue();
  });
}

// BULLETPROOF API endpoint with multiple fallback layers
// Replace your entire '/api/stock/:symbol' endpoint with this
app.get('/api/stock/:symbol', async (req, res) => {
  const symbol = req.params.symbol ? req.params.symbol.toUpperCase() : 'TSLA';
  console.log(`[${new Date().toISOString()}] Request for ${symbol}`);
  res.setHeader('Content-Type', 'application/json');

  // This single try...catch block will handle all unexpected errors
  try {
    // LAYER 1: Fresh cache (< 5 minutes old)
    const cached = cache.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`✓ Serving fresh cache for ${symbol}`);
      return res.status(200).json(cached.data);
    }

    // LAYER 2: Try to get fresh data
    try {
      const data = await queueApiRequest(symbol, 8000);
      if (data.c && data.c !== 0) {
        const stockData = {
          symbol: symbol,
          price: data.c.toFixed(2),
          change: (data.d || 0).toFixed(2),
          changePercent: (data.dp || 0).toFixed(2) + '%',
          volume: data.v || 0,
          lastUpdated: new Date(data.t * 1000).toLocaleDateString()
        };
        
        cache.set(symbol, { data: stockData, timestamp: Date.now() });
        console.log(`✓ Fresh data for ${symbol}`);
        return res.status(200).json(stockData);
      }
    } catch (error) {
      // If fetching fresh data fails, we log it but DON'T stop. We fall through to the next layer.
      console.error(`✗ Failed to fetch fresh data for ${symbol}:`, error.message);
    }

    // LAYER 3: Stale cache (< 1 hour old)
    if (cached && Date.now() - cached.timestamp < STALE_CACHE_DURATION) {
      console.log(`⚠ Serving stale cache for ${symbol}`);
      return res.status(200).json(cached.data);
    }

    // LAYER 4: Mock data as a last resort
    console.log(`⚠ Serving mock data for ${symbol}`);
    const mockData = {
      symbol: symbol,
      price: 'N/A',
      change: '0.00',
      changePercent: '0.00%',
      volume: 0,
      lastUpdated: new Date().toLocaleDateString(),
      _mock: true
    };
    return res.status(200).json(mockData);

  } catch (err) {
    // This is the CRITICAL catch block that was missing.
    // It will catch any other unexpected errors and prevent a server crash.
    console.error('!! Catastrophic error in /api/stock endpoint:', err);
    res.status(500).json({ error: 'An unexpected server error occurred.' });
  }
});

// Form submission endpoint - Price Alerts
app.post('/api/alerts', (req, res) => {
  const { email, symbol, condition, targetPrice } = req.body;
  
  if (!email || !symbol || !condition || !targetPrice) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  
  console.log('Price alert created:', { email, symbol, condition, targetPrice });
  
  res.json({ 
    success: true, 
    message: `Alert set! You'll be notified when ${symbol} goes ${condition} $${targetPrice}` 
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    queueSize: requestQueue.length,
    cacheSize: cache.size,
    requestCount: requestCount
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Rate limit: ${MAX_REQUESTS_PER_MINUTE} requests/minute`);
});