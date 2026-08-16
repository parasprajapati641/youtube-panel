const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
  providerApiKey: {
    type: String,
    default: '8678863199f629b7d2564662ec9d8f03',
  },
  providerApiUrl: {
    type: String,
    default: 'https://smmshiba.com/api/v2',
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
