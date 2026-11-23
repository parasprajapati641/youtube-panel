const mongoose = require('mongoose');

/**
 * One document per videoId.
 * bots / botNames grow as more bots like the same video.
 *
 * Example after 3 likes:
 * {
 *   videoId: "mX0C9dXmVRs",
 *   botNames: ["bot-6", "bot-8", "bot-2"],
 *   bots: [
 *     { botId: ..., botName: "bot-6", likedAt: ... },
 *     { botId: ..., botName: "bot-8", likedAt: ... },
 *     { botId: ..., botName: "bot-2", likedAt: ... }
 *   ]
 * }
 */
const botLikeSchema = new mongoose.Schema({
  videoId: { type: String, required: true, unique: true, index: true },
  botNames: { type: [String], default: [] },
  bots: [
    {
      botId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bot' },
      botName: { type: String, default: '' },
      likedAt: { type: Date, default: Date.now },
    },
  ],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('BotLike', botLikeSchema);
