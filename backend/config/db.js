const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smm_panel';
    const conn = await mongoose.connect(mongoUri);
    console.log(`[MongoDB] Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`[MongoDB Error] ${error.message}`);
    console.log('[MongoDB Warning] Make sure MongoDB is running locally on port 27017 or set MONGO_URI in backend/.env');
  }
};

module.exports = connectDB;
