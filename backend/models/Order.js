const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true,
  },
  link: {
    type: String,
    required: [true, 'Target URL/link is required'],
    trim: true,
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: 1,
  },
  totalCost: {
    type: Number,
    required: true,
  },
  providerOrderId: {
    type: String,
    default: '',
  },
  apiErrorDetails: {
    type: String,
    default: '',
  },
  remains: {
    type: Number,
    default: 0,
  },
  startCount: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Processing', 'Completed', 'Partial', 'Canceled', 'Cancelled'],
    default: 'Pending',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Order', orderSchema);
