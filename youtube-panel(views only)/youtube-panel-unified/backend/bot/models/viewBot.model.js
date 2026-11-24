const mongoose = require('mongoose');

/**
 * Guest View profiles (no Gmail login).
 * Separate collection from Bot (like/comment/subscribe accounts).
 *
 * profiles/view_bot_001 on disk + this document in MongoDB.
 *
 * CHANGE (2026-11): Added browserBrand + engine so each view profile keeps
 * the same spoofed browser identity across runs (fingerprint is already stored).
 */
const viewBotSchema = new mongoose.Schema({
  profileName: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  /** Fixed fingerprint for this profile (UA, viewport, webgl, canvas, etc.) */
  fingerprint: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  /**
   * CHANGE: Stable browser brand assigned once (e.g. "Google Chrome", "Brave", "Mozilla Firefox").
   * Reused on every subsequent view so the same profile always looks like the same browser.
   */
  browserBrand: {
    type: String,
    default: null,
    index: true,
  },
  /**
   * CHANGE: Playwright engine used for this profile: chromium | firefox | webkit
   */
  engine: {
    type: String,
    enum: ['chromium', 'firefox', 'webkit', null],
    default: null,
  },
  /** Playwright/YouTube cookies from persistent profile */
  cookies: {
    type: Array,
    default: [],
  },
  cookieCount: {
    type: Number,
    default: 0,
  },
  /** Last warm-up timestamp */
  lastWarmupAt: {
    type: Date,
    default: null,
  },
  warmed: {
    type: Boolean,
    default: false,
  },
  /**
   * Per-video cooldown map: { [videoId]: ISO date or ms }
   * Same as disk .view_cooldown.json – kept in DB for panel/query.
   */
  videoCooldown: {
    type: Map,
    of: Date,
    default: {},
  },
  lastVideoId: {
    type: String,
    default: '',
  },
  lastWatchedAt: {
    type: Date,
    default: null,
  },
  totalViews: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['active', 'disabled'],
    default: 'active',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

viewBotSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  if (Array.isArray(this.cookies)) {
    this.cookieCount = this.cookies.length;
  }
  next();
});

module.exports = mongoose.model('ViewBot', viewBotSchema);
