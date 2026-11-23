const mongoose = require('mongoose');
const dns = require('dns');

// Set public DNS servers to resolve MongoDB Atlas SRV records reliably on Windows/Node
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {
  // Fallback if setServers fails
}

let isConnected = false;

const connectDB = async () => {
  if (isConnected && mongoose.connection.readyState === 1) {
    return;
  }
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb+srv://krupaprehost_db_user:9hU2BcXjN5Vn3SiN@prehost.k2rzhdj.mongodb.net/youtube-bot-db?retryWrites=true&w=majority';
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      retryWrites: true,
    });
    isConnected = true;
    console.log(`[MongoDB Atlas] Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`[MongoDB Error] ${error.message}`);
    throw error;
  }
};

module.exports = connectDB;
