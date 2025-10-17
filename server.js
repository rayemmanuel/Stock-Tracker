const express = require('express');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory cache to reduce API calls
const cache = new Map();
const CACHE_DURATION = 60000; // 1 minute

// Rate limiting queue for API requests
const requestQueue = [];
let isProcessingQueue = false;
const MAX_REQUESTS_PER_MINUTE = 55; // Keep under Finnhub's 60/min limit
const REQUEST_INTERVAL = 60000 / MAX_REQUESTS_PER_MINUTE; // ~1091ms between requests

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Process queue with rate limiting
async function processQueue() {
  if (isProcessingQueue || requestQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  while (requestQueue.length > 0) {
    const { symbol, resolve, reject } = requestQueue.shift();
    
    try {
      const API_KEY = process.env.FINNHUB_API_KEY;
      
      if (!API_KEY) {
        reject(new Error('API key not configured'));
        continue;
      }
      
      const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${API_KEY}`;
      const response = await axios.get(url);
      
      resolve(response.data);
      
      // Wait before next request to respect rate limit
      if (requestQueue.length > 0) {
        await new Promise(r => setTimeout(r, REQUEST_INTERVAL));
      }
    } catch (error) {
      reject(error);
    }
  }
  
  isProcessingQueue = false;
}

// Queue API request with rate limiting
function queueApiRequest(symbol) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ symbol, resolve, reject });
    processQueue();
  });
}

// API endpoint to get stock data with caching and rate limiting
app.get('/api/stock/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  
  // Check cache first
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return res.json(cached.data);
  }
  
  try {
    // Use rate-limited queue
    const data = await queueApiRequest(symbol);
    
    if (data.c && data.c !== 0) {
      const stockData = {
        symbol: symbol,
        price: data.c.toFixed(2),
        change: (data.d || 0).toFixed(2),
        changePercent: (data.dp || 0).toFixed(2) + '%',
        volume: data.v || 0,
        lastUpdated: new Date(data.t * 1000).toLocaleDateString()
      };
      
      // Store in cache
      cache.set(symbol, {
        data: stockData,
        timestamp: Date.now()
      });
      
      res.json(stockData);
    } else {
      res.status(404).json({ error: 'Stock not found or market closed' });
    }
  } catch (error) {
    console.error('API Error:', error.message);
    
    // Return cached data even if expired, rather than error
    const expired = cache.get(symbol);
    if (expired) {
      console.log(`Returning stale cache for ${symbol}`);
      return res.json(expired.data);
    }
    
    res.status(500).json({ error: 'Failed to fetch stock data' });
  }
});

// Form submission endpoint
app.post('/api/watchlist', (req, res) => {
  const { name, email, stocks } = req.body;
  
  if (!name || !email || !stocks) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  // In a real app, you'd save this to a database
  console.log('Watchlist submission:', { name, email, stocks });
  
  res.json({ 
    success: true, 
    message: `Thank you ${name}! Your watchlist for ${stocks} has been saved.` 
  });
});

// Form submission endpoint - Price Alerts
app.post('/api/alerts', (req, res) => {
  const { email, symbol, condition, targetPrice } = req.body;
  
  if (!email || !symbol || !condition || !targetPrice) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  
  // In a real app, you'd save this to a database and set up actual alerts
  console.log('Price alert created:', { email, symbol, condition, targetPrice });
  
  res.json({ 
    success: true, 
    message: `Alert set! You'll be notified when ${symbol} goes ${condition} ${targetPrice}` 
  });
});

// Health check endpoint for monitoring
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});