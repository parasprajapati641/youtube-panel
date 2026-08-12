const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const { initCron } = require('./services/cronService');

dotenv.config();

const app = express();

// Connect Database
connectDB();

// Initialize Cron background status synchronization
initCron();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/services', require('./routes/serviceRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'YouTube & Social Media Marketing Panel Backend API with SMM API v2 & Cron Sync is running smoothly',
    timestamp: new Date(),
  });
});

// Global 404 Route
app.use((req, res) => {
  res.status(404).json({ message: 'API Endpoint Not Found' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`[Server] SMM Panel Backend running on port ${PORT}`);
  console.log(`[Server] API Health check available at http://localhost:${PORT}/api/health`);
});
