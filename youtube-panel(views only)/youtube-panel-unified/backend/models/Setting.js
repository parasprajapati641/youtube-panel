const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
  providerApiKey: {
    type: String,
    default: '',
  },
  providerApiUrl: {
    type: String,
    default: '',
  },
  siteName: {
    type: String,
    default: 'YouTube & Social SMM Panel',
  },
  defaultProfitMargin: {
    type: Number,
    default: 20,
    min: 0,
  },
  categoryMargins: {
    type: Map,
    of: Number,
    default: {},
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Setting', settingSchema);
