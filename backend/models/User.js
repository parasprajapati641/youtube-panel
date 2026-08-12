const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    lowercase: true,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
  },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user',
  },
  balance: {
    type: Number,
    default: 0,
  },
  isUnlimited: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ['active', 'blocked'],
    default: 'active',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('User', userSchema);
