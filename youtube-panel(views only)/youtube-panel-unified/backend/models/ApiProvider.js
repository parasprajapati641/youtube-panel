const mongoose = require('mongoose');

const apiProviderSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Provider name is required'],
    trim: true,
  },
  apiUrl: {
    type: String,
    required: [true, 'API URL endpoint is required'],
    trim: true,
  },
  apiKey: {
    type: String,
    required: [true, 'API Key is required'],
    trim: true,
  },
  balance: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('ApiProvider', apiProviderSchema);
