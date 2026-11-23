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

// Unified: Playwright YouTube bot (same process)
app.use('/api/bot', require('./bot/routes/bot.routes'));

// External Cron Sync Route for Serverless Vercel / External Cron Services (e.g., cron-job.org)
app.get('/api/cron/sync-orders', async (req, res) => {
  try {
    console.log('[Cron Endpoint Triggered] Initiating provider order status synchronization...');
    const result = await syncOrdersStatus();
    res.json({
      success: true,
      message: 'Order status synchronization completed successfully',
      result,
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

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Panel + Local Bot unified',
    bot: '/api/bot',
    timestamp: new Date(),
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend Live',
  });
});

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend Live',
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
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Unified Panel + Playwright Bot on port ${PORT}`);
    console.log(`[Server] Panel API:  http://localhost:${PORT}/api`);
    console.log(`[Server] Bot API:    http://localhost:${PORT}/api/bot`);
    console.log(`[Server] Health:     http://localhost:${PORT}/api/health`);
  });
}
// http://192.168.1.67:5000/api/health
module.exports = app;
