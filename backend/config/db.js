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
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb+srv://parasprehost_db_user:TfQd5GrqIdgWbYj1@youtube-panel.4d0oxqe.mongodb.net/smm_panel?retryWrites=true&w=majority&appName=youtube-panel';
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
