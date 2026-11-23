const mongoose = require('mongoose');

const botSchema = new mongoose.Schema({
  botName: { type: String, required: true, unique: true, trim: true },
  cookies: { type: Array, default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

botSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Bot', botSchema);
