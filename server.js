const express = require('express');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory cache to reduce API calls
const cache = new Map();
const CACHE_DURATION = 60000; // 1 minute

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API endpoint to get stock data with caching
app.get('/api/stock/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  
  // Check cache first
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return res.json(cached.data);
  }
  
  try {
    // Using Finnhub API (60 calls/minute on free tier)
    const API_KEY = process.env.FINNHUB_API_KEY;
    
    if (!API_KEY) {
      return res.status(500).json({ 
        error: 'API key not configured. Please add FINNHUB_API_KEY to .env file' 
      });
    }
    
    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${API_KEY}`;
    
    const response = await axios.get(url);
    const data = response.data;
    
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