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
  // super_admin | admin | user
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'user'],
    default: 'user',
  },
  balance: {
    type: Number,
    default: 0, // USD fund for spending (orders)
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

  // ----- Limits for role=admin (set by super_admin) -----
  // Max earning allowed in one calendar month (INR / rupees)
  monthlyEarningLimitInr: {
    type: Number,
    default: 0,
  },
  monthlyEarningUsedInr: {
    type: Number,
    default: 0,
  },
  monthlyEarningMonthKey: {
    type: String,
    default: null, // e.g. "2026-11"
  },
  // Max per action type per day: limit=100 → 100 likes AND 100 comments
  dailyBotLimit: {
    type: Number,
    default: 0, // 0 = no cap
  },
  dailyLikeUsed: {
    type: Number,
    default: 0,
  },
  dailyCommentUsed: {
    type: Number,
    default: 0,
  },
  // legacy combined (kept for old data; prefer like/comment fields)
  dailyBotUsed: {
    type: Number,
    default: 0,
  },
  dailyBotDateKey: {
    type: String,
    default: null, // e.g. "2026-11-03"
  },
  // Channel lock: first like/comment video's channel
  lockedChannelId: {
    type: String,
    default: null,
  },
  lockedChannelTitle: {
    type: String,
    default: null,
  },
  lockedChannelUrl: {
    type: String,
    default: null,
  },
  lockedAt: {
    type: Date,
    default: null,
  },

  // Session for JWT invalidation
  activeSessionId: {
    type: String,
    default: null,
  },
  // First-login device lock
  boundDeviceId: {
    type: String,
    default: null,
  },
  boundDeviceInfo: {
    type: String,
    default: null,
  },
  boundAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('User', userSchema);
