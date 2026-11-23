const Bot = require('../models/bot.model');
const botService = require('../services/bot.service');
const { hasAuthCookies } = require('../utils/cookie.util');

function validateVideoAndBots(body) {
  const { videoUrl, botCount, botName } = body;

  if (!videoUrl) {
    return { error: 'videoUrl required' };
  }
  if (!botName && (botCount === undefined || botCount === null)) {
    return { error: 'Provide botName (single bot) OR botCount (N bots)' };
  }

  try {
    new URL(videoUrl);
  } catch {
    return { error: 'Invalid URL' };
  }
  if (!videoUrl.includes('youtube.com') && !videoUrl.includes('youtu.be')) {
    return { error: 'Must be YouTube URL' };
  }

  let count = null;
  if (!botName) {
    count = parseInt(botCount, 10);
    if (isNaN(count) || count < 1 || count > 50) {
      return { error: 'botCount must be 1-50' };
    }
  }

  return {
    videoUrl,
    botName: botName ? String(botName).trim() : undefined,
    botCount: count
  };
}

function parseComments(comments) {
  // Full list – each bot posts a different line
  if (!Array.isArray(comments)) return undefined;
  const list = comments
    .filter((c) => typeof c === 'string' && c.trim())
    .map((c) => c.trim());
  return list.length ? list : undefined;
}

class BotController {
  /**
   * POST /api/bot/register
   *
   * Body:
   *   { botName }                      → MANUAL: blank browser opens.
   *                                      User opens YouTube, signup/login, browses.
   *                                      When user CLOSES browser → cookies saved.
   *   { botName, email, password }     → AUTO: Google login + cookies save
   */
  async registerBot(req, res) {
    try {
      const { botName, email, password } = req.body;
      if (!botName || botName.trim().length < 2) {
        return res.status(400).json({ success: false, message: 'botName required (min 2 chars)' });
      }
      const name = botName.trim();
      if (await Bot.findOne({ botName: name })) {
        return res.status(400).json({
          success: false,
          message: `Bot "${name}" exists. Use POST /api/bot/refresh/${name}`,
        });
      }

      // email+password → auto login; otherwise manual (blank browser → close to save)
      const bot = await botService.registerAndLoginBot(name, { email, password });
      return res.status(201).json({
        success: true,
        message: email && password
          ? `Bot '${name}' registered via auto login.`
          : `Bot '${name}' registered. Browser was closed – cookies saved.`,
        data: {
          _id: bot._id,
          botName: bot.botName,
          cookieCount: (bot.cookies || []).length,
          createdAt: bot.createdAt,
        },
      });
    } catch (err) {
      console.error('[REGISTER]', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/bot/register-csv  (NEW – bulk)
   *
   * Body: { csv: "email,password\n..." }
   *    or { csv: "email,password,botName\n..." }
   *
   * Each row → auto login → cookies save → { ok[], failed[] }
   */
  async registerBotsCsv(req, res) {
    try {
      const csv = req.body.csv || req.body.text || '';
      if (!csv || !String(csv).trim()) {
        return res.status(400).json({
          success: false,
          message: 'csv text required. Format: email,password  OR  email,password,botName',
        });
      }

      const results = await botService.registerBotsFromCsv(csv);
      return res.status(201).json({
        success: true,
        message: `Registered ${results.ok.length} bot(s), ${results.failed.length} failed`,
        data: results,
      });
    } catch (err) {
      console.error('[REGISTER-CSV]', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  }


  /**
   * POST /api/bot/register-cookies
   * Single bot from cookies (no Google login).
   * Body: { botName, cookies: [ ... ] }
   */
  async importBotCookies(req, res) {
    try {
      const { botName, cookies } = req.body;
      if (!botName || !cookies) {
        return res.status(400).json({
          success: false,
          message: 'botName and cookies[] required',
        });
      }
      const bot = await botService.importBotFromCookies(botName, cookies);
      return res.status(201).json({
        success: true,
        message: `Bot '${bot.botName}' imported from cookies`,
        data: {
          _id: bot._id,
          botName: bot.botName,
          cookieCount: (bot.cookies || []).length,
        },
      });
    } catch (err) {
      console.error('[IMPORT-COOKIES]', err.message);
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/bot/register-cookies-bulk
   * Bulk import – FAST (no browser).
   * Body: { bots: [ { botName, cookies } ] }  OR  raw array  OR  { json: "..." }
   */
  async importBotsCookiesBulk(req, res) {
    try {
      let payload = req.body.bots ?? req.body.data ?? req.body.json ?? req.body;
      // If body is { json: string }
      if (payload && payload.json && typeof payload.json === 'string') {
        payload = payload.json;
      }
      const results = await botService.importBotsFromCookiesBulk(payload);
      return res.status(201).json({
        success: true,
        message: `Imported ${results.ok.length} bot(s), ${results.failed.length} failed`,
        data: results,
      });
    } catch (err) {
      console.error('[IMPORT-COOKIES-BULK]', err.message);
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  async refreshBot(req, res) {
    try {
      const bot = await botService.refreshBotLogin(req.params.botName);
      return res.json({
        success: true,
        message: `Refreshed '${req.params.botName}'`,
        data: {
          botName: bot.botName,
          cookieCount: (bot.cookies || []).length
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/bot/like
   * Body: { videoUrl, botName? | botCount? }
   */
  async likeVideo(req, res) {
    try {
      const parsed = validateVideoAndBots(req.body);
      if (parsed.error) {
        return res.status(400).json({ success: false, message: parsed.error });
      }

      botService
        .processActions(parsed.videoUrl, {
          botName: parsed.botName,
          botCount: parsed.botCount,
          doLike: true,
          doComment: false
        })
        .then((r) => console.log('[LIKE DONE]', JSON.stringify(r, null, 2)))
        .catch((e) => console.error('[LIKE ERR]', e.message));

      return res.json({
        success: true,
        message: parsed.botName
          ? `Like started for bot "${parsed.botName}"`
          : `Like started for ${parsed.botCount} bot(s)`,
        data: {
          videoUrl: parsed.videoUrl,
          botName: parsed.botName || null,
          botCount: parsed.botCount,
          action: 'like'
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/bot/comment
   * Body: { videoUrl, botName? | botCount?, comments?: string[] }
   * comments optional (max 5). Random one per bot. Else 5 defaults.
   */
  // async commentVideo(req, res) {
  //   try {
  //     const parsed = validateVideoAndBots(req.body);
  //     if (parsed.error) {
  //       return res.status(400).json({ success: false, message: parsed.error });
  //     }

  //     const commentList = parseComments(req.body.comments);

  //     botService
  //       .processActions(parsed.videoUrl, {
  //         botName: parsed.botName,
  //         botCount: parsed.botCount,
  //         doLike: false,
  //         doComment: true,
  //         comments: commentList
  //       })
  //       .then((r) => console.log('[COMMENT DONE]', JSON.stringify(r, null, 2)))
  //       .catch((e) => console.error('[COMMENT ERR]', e.message));

  //     return res.json({
  //       success: true,
  //       message: parsed.botName
  //         ? `Comment started for bot "${parsed.botName}"`
  //         : `Comment started for ${parsed.botCount} bot(s)`,
  //       data: {
  //         videoUrl: parsed.videoUrl,
  //         botName: parsed.botName || null,
  //         botCount: parsed.botCount,
  //         action: 'comment',
  //         commentsProvided: commentList ? commentList.length : 0,
  //         usingDefaults: !commentList
  //       }
  //     });
  //   } catch (err) {
  //     return res.status(500).json({ success: false, message: err.message });
  //   }
  // }

  async commentVideo(req, res) {
    try {
      const parsed = validateVideoAndBots(req.body);
      if (parsed.error) {
        return res.status(400).json({ success: false, message: parsed.error });
      }

      const commentList = parseComments(req.body.comments);

      botService
        .processActions(parsed.videoUrl, {
          botName: parsed.botName,
          botCount: parsed.botCount,
          doLike: false,
          doComment: true,
          comments: commentList
        })
        .then((r) => console.log('[COMMENT DONE]', JSON.stringify(r, null, 2)))
        .catch((e) => console.error('[COMMENT ERR]', e.message));

      return res.json({
        success: true,
        message: parsed.botName
          ? `Comment started for bot "${parsed.botName}"`
          : `Comment started for ${parsed.botCount} bot(s)`,
        data: {
          videoUrl: parsed.videoUrl,
          botName: parsed.botName || null,
          botCount: parsed.botCount,
          action: 'comment',
          commentsProvided: commentList ? commentList.length : 0,
          usingDefaults: !commentList
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/bot/subscribe
   * Body: { url OR videoUrl OR channelUrl, botName? | botCount? }
   * url can be channel link OR video link – both work.
   */
  async subscribeChannel(req, res) {
    try {
      const url =
        req.body.url ||
        req.body.channelUrl ||
        req.body.videoUrl ||
        req.body.profileUrl;

      if (!url) {
        return res.status(400).json({
          success: false,
          message:
            'Provide url (channel OR video link). Examples: https://www.youtube.com/@name OR https://www.youtube.com/watch?v=...'
        });
      }

      try {
        new URL(url);
      } catch {
        return res.status(400).json({ success: false, message: 'Invalid URL' });
      }
      if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
        return res.status(400).json({ success: false, message: 'Must be YouTube URL' });
      }

      const { botName, botCount } = req.body;
      if (!botName && (botCount === undefined || botCount === null)) {
        return res.status(400).json({
          success: false,
          message: 'Provide botName OR botCount'
        });
      }

      let count = null;
      if (!botName) {
        count = parseInt(botCount, 10);
        if (isNaN(count) || count < 1 || count > 50) {
          return res.status(400).json({ success: false, message: 'botCount 1-50' });
        }
      }

      botService
        .processSubscribe(url, {
          botName: botName ? String(botName).trim() : undefined,
          botCount: count
        })
        .then((r) => console.log('[SUBSCRIBE DONE]', JSON.stringify(r, null, 2)))
        .catch((e) => console.error('[SUBSCRIBE ERR]', e.message));

      return res.json({
        success: true,
        message: botName
          ? `Subscribe started for bot "${botName}"`
          : `Subscribe started for ${count} bot(s)`,
        data: {
          url,
          botName: botName || null,
          botCount: count,
          action: 'subscribe',
          tip: 'Channel link (@handle /channel/UC...) OR video link both work'
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async listBots(req, res) {

    try {
      const bots = await Bot.find().select('-cookies').sort({ createdAt: -1 });
      return res.json({ success: true, count: bots.length, data: bots });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async getBot(req, res) {
    try {
      const bot = await Bot.findOne({ botName: req.params.botName });
      if (!bot) return res.status(404).json({ success: false, message: 'Not found' });
      return res.json({
        success: true,
        data: {
          botName: bot.botName,
          cookieCount: (bot.cookies || []).length,
          hasAuth: hasAuthCookies(bot.cookies || []),
          updatedAt: bot.updatedAt,
          createdAt: bot.createdAt
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async deleteBot(req, res) {
    try {
      const deleted = await Bot.findOneAndDelete({ botName: req.params.botName });
      if (!deleted) return res.status(404).json({ success: false, message: 'Not found' });
      return res.json({ success: true, message: `Deleted '${req.params.botName}'` });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}

module.exports = new BotController();
