const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const { initCron, syncOrdersStatus } = require('./services/cronService');

dotenv.config();

const app = express();

// Connect Database
connectDB();

// Middleware to ensure DB connection per request on serverless cold starts
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    res.status(500).json({ message: 'Database connection failed', error: err.message });
  }
});

// Middleware - Allow all client origins
app.use(cors({ origin: '*' }));
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/services', require('./routes/serviceRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

// External Cron Sync Route for Serverless Vercel / External Cron Services (e.g., cron-job.org)
app.get('/api/cron/sync-orders', async (req, res) => {
  try {
    console.log('[Cron Endpoint Triggered] Initiating provider order status synchronization...');
    await syncOrdersStatus();
    res.json({
      success: true,
      message: 'Order status synchronization completed successfully',
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('[Cron Endpoint Error]', error);
    res.status(500).json({
      success: false,
      message: 'Order status synchronization failed',
      error: error.message,
    });
  }
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'YouTube & Social Media Marketing Panel Backend API with SMM API v2 & Cron Sync is running smoothly',
    timestamp: new Date(),
  });
});

// Global 404 Route for API
app.use('/api/*', (req, res) => {
  res.status(404).json({ message: 'API Endpoint Not Found' });
});

// Initialize Cron background status synchronization (in traditional long-running node processes)
if (!process.env.VERCEL) {
  initCron();
}

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[Server] SMM Panel Backend running on port ${PORT}`);
    console.log(`[Server] API Health check available at http://localhost:${PORT}/api/health`);
  });
}

module.exports = app;
