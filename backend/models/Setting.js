const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
  providerApiKey: {
    type: String,
    default: '',
  },
  providerApiUrl: {
    type: String,
    default: 'https://api.smmprovider.com/v2',
  },
  siteName: {
    type: String,
    default: 'YouTube & Social SMM Panel',
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Setting', settingSchema);
