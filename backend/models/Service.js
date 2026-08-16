const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Service name is required'],
    trim: true,
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true,
  },
  ratePer1000: {
    type: Number,
    required: [true, 'Selling rate per 1000 is required'],
    min: 0,
  },
  originalRate: {
    type: Number,
    default: 0,
    min: 0,
  },
  marginPercent: {
    type: Number,
    default: null,
  },
  refill: {
    type: Boolean,
    default: false,
  },
  type: {
    type: String,
    default: 'Default',
  },
  minQuantity: {
    type: Number,
    default: 100,
    min: 1,
  },
  maxQuantity: {
    type: Number,
    default: 100000,
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ApiProvider',
    default: null,
  },
  providerServiceId: {
    type: String,
    default: '',
  },
  speed: {
    type: String,
    default: 'Instant 30 min delivery',
  },
  description: {
    type: String,
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Service', serviceSchema);
