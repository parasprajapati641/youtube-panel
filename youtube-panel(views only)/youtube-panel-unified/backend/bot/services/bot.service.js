'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const proxyChain = require('proxy-chain');
const Bot = require('../models/bot.model');
const BotLike = require('../models/botLike.model');
const ViewBot = require('../models/viewBot.model');
const { normalizeCookies, hasAuthCookies } = require('../utils/cookie.util');
const { findChromePath, vmwareArgs } = require('../utils/browser.util');
const proxyPool = require('../utils/proxyPool.util');
const {
  buildFingerprint,
  contextOptionsFromFp,
  fingerprintInitScript,
  logFingerprint,
  clientHintHeaders,
  initScriptPayload,
  simulateHumanBehavior,
} = require('../utils/fingerprint.util');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EXHAUSTED_PROXIES = new Set();

function proxyKey(p) {
  if (!p) return '';
  return `${p.server}|${p.username || ''}`;
}

function isUnlimitedTurboActive() {
  const list = Array.isArray(proxyPool.proxies) ? proxyPool.proxies : [];
  const active = list.filter((p) => !EXHAUSTED_PROXIES.has(proxyKey(p)));
  return active.length > 0 && !!active[0].unlimitedHourly;
}

function buildAuthProxyUrl(proxyObj, sessionSalt = '') {
  if (!proxyObj || !proxyObj.server) return null;
  if (!proxyObj.username) return proxyObj.server;
  const u = new URL(proxyObj.server);
  let user = proxyObj.username;
  if (sessionSalt && user.startsWith('customer-') && !user.includes('-sessid-')) {
    const cleanSess = String(sessionSalt).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
    if (cleanSess) user = `${user}-sessid-${cleanSess}`;
  }
  u.username = encodeURIComponent(user);
  u.password = encodeURIComponent(proxyObj.password || '');
  return u.toString();
}

function getBotConcurrency(totalBots) {
  const total = Math.max(1, parseInt(totalBots, 10) || 1);
  const minRaw = process.env.BOT_CONCURRENCY_MIN;
  const maxRaw = process.env.BOT_CONCURRENCY_MAX;
  const percentRaw = process.env.BOT_CONCURRENCY_PERCENT || process.env.BOT_CONCURRENCY_PER_100;

  const min = Math.max(1, parseInt(minRaw !== undefined && minRaw !== '' ? minRaw : '1', 10) || 1);
  const max = Math.max(1, parseInt(maxRaw !== undefined && maxRaw !== '' ? maxRaw : '2', 10) || 2);
  const percent = Math.max(1, parseInt(percentRaw !== undefined && percentRaw !== '' ? percentRaw : '10', 10) || 10);

  let c = Math.round((total * percent) / 100);
  if (c < min) c = min;
  if (c > max) c = max;
  return Math.min(c, total);
}

async function runWithConcurrency(items, concurrency, workerFn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await workerFn(items[i], i);
    }
  }

  const n = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

function navTimeout() {
  return parseInt(process.env.NAV_TIMEOUT_MS || '45000', 10) || 45000;
}
function actionTimeout() {
  return parseInt(process.env.ACTION_TIMEOUT_MS || '25000', 10) || 25000;
}

const DEFAULT_COMMENTS = [
  'Nice video! 🔥',
  'Great content, keep it up!',
  'Really enjoyed this 👍',
  'Awesome, thanks for sharing!',
  'Love this video ❤️',
  'Very informative and helpful!',
];

function resolveProfilesRoot() {
  const envRoot = (process.env.PROFILES_ROOT || '').trim();
  if (!envRoot || envRoot === '/profiles' || envRoot === '\\profiles' || envRoot === '/profiles/' || envRoot === 'profiles') {
    return path.join(process.cwd(), 'profiles');
  }
  return path.isAbsolute(envRoot) ? envRoot : path.resolve(process.cwd(), envRoot);
}

const PROFILES_ROOT = resolveProfilesRoot();
if (!fs.existsSync(PROFILES_ROOT)) {
  fs.mkdirSync(PROFILES_ROOT, { recursive: true });
}

function profileDir(botName) {
  let safe = String(botName).replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!/^view_bot_/i.test(safe)) {
    safe = !safe.toLowerCase().startsWith('bot_') && !safe.toLowerCase().startsWith('bot-')
      ? `bot_${safe}`
      : safe.replace(/^bot[-_]/i, 'bot_');
  }
  const dir = path.join(PROFILES_ROOT, safe);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function viewProfileName(index1Based) {
  const n = Math.max(1, parseInt(index1Based, 10) || 1);
  return `view_bot_${String(n).padStart(4, '0')}`;
}

const VIEW_COOLDOWN_MS = () => {
  const h = parseInt(process.env.VIEW_COOLDOWN_HOURS || '72', 10);
  return Math.max(1, isNaN(h) ? 72 : h) * 3600 * 1000;
};

function viewCooldownPath(profileName) {
  return path.join(profileDir(profileName), '.view_cooldown.json');
}

function loadViewCooldown(profileName) {
  try {
    const p = viewCooldownPath(profileName);
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8') || '{}') || {};
  } catch (_) {
    return {};
  }
}

function saveViewCooldown(profileName, data) {
  try {
    fs.writeFileSync(viewCooldownPath(profileName), JSON.stringify(data, null, 2), 'utf8');
  } catch (_) {}
}

function isViewProfileOnCooldown(profileName, videoId) {
  if (!videoId) return false;
  const ts = loadViewCooldown(profileName)[videoId];
  return ts ? Date.now() - Number(ts) < VIEW_COOLDOWN_MS() : false;
}

function markViewProfileWatched(profileName, videoId) {
  if (!videoId) return;
  const data = loadViewCooldown(profileName);
  data[videoId] = Date.now();
  saveViewCooldown(profileName, data);
}

function extractYoutubeVideoId(url) {
  try {
    const u = String(url || '');
    const m =
      u.match(/[?&]v=([a-zA-Z0-9_-]{6,})/) ||
      u.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/) ||
      u.match(/\/shorts\/([a-zA-Z0-9_-]{6,})/) ||
      u.match(/\/live\/([a-zA-Z0-9_-]{6,})/) ||
      u.match(/\/embed\/([a-zA-Z0-9_-]{6,})/);
    return m ? m[1] : null;
  } catch (_) {
    return null;
  }
}

function pickGuestViewProfiles(count, videoId) {
  const need = Math.max(1, parseInt(count, 10) || 1);
  const maxPool = Math.max(need, parseInt(process.env.VIEW_PROFILE_POOL_MAX || '100000', 10) || 100000);
  const picked = [];
  let idx = 1;
  while (picked.length < need && idx <= maxPool) {
    const name = viewProfileName(idx);
    profileDir(name);
    if (!isViewProfileOnCooldown(name, videoId)) picked.push(name);
    idx++;
  }
  while (picked.length < need && idx <= maxPool + need) {
    const name = viewProfileName(idx);
    profileDir(name);
    picked.push(name);
    idx++;
  }
  return picked;
}

function normalizeCommentList(comments) {
  const list = Array.isArray(comments) && comments.length > 0
    ? comments.filter((c) => typeof c === 'string' && c.trim()).map((c) => c.trim())
    : [...DEFAULT_COMMENTS];
  return list.length ? list : [...DEFAULT_COMMENTS];
}

function pickRandomComment(comments) {
  const list = normalizeCommentList(comments);
  return list[Math.floor(Math.random() * list.length)];
}

class BotService {
  /**
   * Safe Bandwidth Optimizer:
   * Blocks ONLY storyboard sprites (i.ytimg.com/sb/) & fonts (~55% data saved)
   * Never touches YouTube telemetry (/api/stats/watchtime, qoe, playback) or audio/video!
   */
  async _enableSafeDataSaver(context) {
    if (process.env.DISABLE_DATA_SAVER === 'true') return;
    try {
      await context.route('**/*', (route) => {
        const req = route.request();
        const url = req.url();
        const type = req.resourceType();

        if (type === 'font' || url.includes('i.ytimg.com/sb/')) {
          return route.abort().catch(() => {});
        }
        return route.continue().catch(() => {});
      });
    } catch (_) {}
  }

  async _getReusableProxy(profileName, forLogin = false, skipOffset = 0) {
    if (process.env.DISABLE_PROXY === 'true') return null;
    if (forLogin && process.env.LOGIN_USE_PROXY === 'false') return null;

    if (proxyPool.proxies.length === 0) {
      await proxyPool.scrapeAndHarvest(500, 150);
    }
    if (!proxyPool.proxies.length) return null;

    const activeList = proxyPool.proxies.filter((p) => !EXHAUSTED_PROXIES.has(proxyKey(p)));
    const pool = activeList.length > 0 ? activeList : proxyPool.proxies;
    return pool[Math.abs(skipOffset) % pool.length];
  }

  _markProxyExhausted(proxyObj, reason = '') {
    if (!proxyObj) return;
    const key = proxyKey(proxyObj);
    if (!EXHAUSTED_PROXIES.has(key)) {
      EXHAUSTED_PROXIES.add(key);
      console.warn(`[PROXY-FAILOVER] Switched off exhausted proxy: ${proxyObj.username || proxyObj.server} (${reason})`);
    }
  }

  async _launchWithProfile(botName, { headless = false, forLogin = false } = {}) {
    const userDataDir = profileDir(botName);
    const chromePath = findChromePath();
    const { args: baseArgs, width, height, lowMem } = vmwareArgs();
    let args = [...baseArgs];

    if (forLogin) {
      args = args.filter(
        (a) =>
          a !== '--single-process' &&
          a !== '--no-zygote' &&
          a !== '--disable-gpu' &&
          a !== '--disable-software-rasterizer' &&
          a !== '--in-process-gpu' &&
          !String(a).startsWith('--js-flags')
      );
      args.push('--disable-blink-features=AutomationControlled', '--force-color-profile=srgb');
    }

    if (!headless && !lowMem) args.push('--start-maximized');

    const selectedProxy = await this._getReusableProxy(botName, forLogin);
    const fpLowMem = lowMem || process.env.LOW_MEMORY === 'true' || process.env.VMWARE === 'true';
    const fp = buildFingerprint(botName, { lowMem: fpLowMem, browserBrand: 'Google Chrome', proxyGeo: selectedProxy });
    logFingerprint(fp);
    const fpOpts = contextOptionsFromFp(fp);

    const launchOpts = {
      headless: !!headless,
      args,
      ignoreDefaultArgs: ['--enable-automation'],
      ...fpOpts,
      viewport: fpLowMem ? { width: width || 1024, height: height || 576 } : fpOpts.viewport,
    };

    if (chromePath) launchOpts.executablePath = chromePath;
    else if (forLogin && process.env.USE_CHANNEL_CHROME !== 'false') launchOpts.channel = 'chrome';

    let localAnonymizedUrl = null;
    if (selectedProxy) {
      const rawUrl = buildAuthProxyUrl(selectedProxy);
      localAnonymizedUrl = await proxyChain.anonymizeProxy(rawUrl);
      launchOpts.proxy = { server: localAnonymizedUrl };
    }

    let context;
    try {
      context = await chromium.launchPersistentContext(userDataDir, launchOpts);
    } catch (launchErr) {
      if (localAnonymizedUrl) {
        await proxyChain.closeAnonymizedProxy(localAnonymizedUrl, true).catch(() => {});
        localAnonymizedUrl = null;
      }
      if (selectedProxy) {
        this._markProxyExhausted(selectedProxy, launchErr.message);
        delete launchOpts.proxy;
        context = await chromium.launchPersistentContext(userDataDir, launchOpts);
      } else {
        throw launchErr;
      }
    }

    await context.addInitScript(fingerprintInitScript(fp), initScriptPayload(fp));
    await context.setExtraHTTPHeaders(clientHintHeaders(fp)).catch(() => {});

    const page = context.pages()[0] || (await context.newPage());
    return { browser: context, context, page, fingerprint: fp, proxyObj: selectedProxy, localAnonymizedUrl };
  }

  async _isLoggedIn(page) {
    try {
      return await page.evaluate(() => {
        const hasAvatar = !!(
          document.querySelector('#avatar-btn') ||
          document.querySelector('button#avatar-btn') ||
          document.querySelector('yt-img-shadow#avatar')
        );
        const signIn = document.querySelector('a[aria-label="Sign in"]');
        return hasAvatar && !signIn;
      });
    } catch (_) {
      return false;
    }
  }

  async _getCookies(context) {
    try {
      return (await context.cookies()) || [];
    } catch (_) {
      return [];
    }
  }

  async _dismissBanners(page) {
    try {
      if (page.url().includes('consent.youtube.com') || page.url().includes('consent.google.com')) {
        const acceptBtn = page
          .locator('form[action*="consent"] button, button[aria-label*="Accept"], button:has-text("Accept all"), button:has-text("Reject all")')
          .first();
        if (await acceptBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
          await acceptBtn.click({ timeout: 4000 }).catch(() => {});
          await sleep(2000);
          return;
        }
      }

      await page.evaluate(() => {
        const texts = ['Got it', 'Accept all', 'Reject all', 'I agree', 'Accept', 'Dismiss', 'No thanks'];
        const candidates = [...document.querySelectorAll('button, yt-button-shape button, tp-yt-paper-button')];
        for (const t of texts) {
          const btn = candidates.find(
            (b) => (b.innerText || b.textContent || '').trim().toLowerCase() === t.toLowerCase()
          );
          if (btn && btn.offsetParent !== null) {
            btn.click();
            break;
          }
        }
      });
    } catch (_) {}
  }

  async _skipAdsIfPresent(page, botName = '') {
    try {
      const skipped = await page.evaluate(() => {
        const adShowing = document.querySelector('.ad-showing') || document.querySelector('.ytp-ad-player-overlay');
        if (!adShowing) return false;

        const skipSelectors = [
          '.ytp-ad-skip-button',
          '.ytp-ad-skip-button-modern',
          '.ytp-skip-ad-button',
          'button.ytp-ad-skip-button-modern',
        ];
        for (const sel of skipSelectors) {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null) {
            el.click();
            return 'skip-btn';
          }
        }
        return 'ad-present';
      });

      if (skipped === 'skip-btn') {
        if (botName) console.log(`[${botName}] Ad skipped`);
        await sleep(500);
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  async _forceLowestQuality(page) {
    try {
      await page.evaluate(() => {
        const player = document.getElementById('movie_player');
        if (player && typeof player.setPlaybackQualityRange === 'function') {
          player.setPlaybackQualityRange('medium', 'medium');
          player.setPlaybackQuality('medium');
        }
      });
    } catch (_) {}
  }

  /**
   * Realistic Multi-Source Organic Discovery + 100% Exact Video-ID Lock:
   * - 55% YouTube Search (warms up YouTube homepage, searches title+channel, clicks exact videoId)
   * - 25% Google Search Referrer (simulates organic click from google.com search results)
   * - 20% YouTube Home/Browse Feed (warms up YouTube feed, enters exact videoId)
   * - Final URL Check guarantees 100% lock on your ordered videoId
   */
  async _navigateToExactVideo(page, { videoId, videoTitle, cleanWatchUrl, profileName, turboMode = false }) {
    const encodedQuery = encodeURIComponent(videoTitle || videoId || '');
    const ytSearchReferer = encodedQuery
      ? `https://www.youtube.com/results?search_query=${encodedQuery}`
      : 'https://www.youtube.com/';
    const googleReferer = encodedQuery
      ? `https://www.google.com/search?q=${encodedQuery}+youtube`
      : 'https://www.google.com/';

    const roll = Math.random();
    let mode = 'youtube-search';

    if ((turboMode || roll < 0.55) && videoId && videoTitle && videoTitle !== videoId) {
      try {
        console.log(`[VIEWS] ${profileName} [YouTube Search] Warming up & searching exact video [${videoId}]`);
        await page.goto('https://www.youtube.com/', {
          waitUntil: 'domcontentloaded',
          timeout: navTimeout(),
        });
        await sleep(turboMode ? 1000 : 1800 + Math.floor(Math.random() * 1000));
        await this._dismissBanners(page).catch(() => {});

        if (!turboMode) {
          await page.evaluate(() => window.scrollBy({ top: 220, behavior: 'smooth' })).catch(() => {});
          await sleep(700);
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })).catch(() => {});
          await sleep(400);
        }

        const searchInput = page.locator('input#search, input[name="search_query"]').first();
        await searchInput.waitFor({ state: 'visible', timeout: 8000 });
        await searchInput.click({ timeout: 3000 });
        await searchInput.fill('');
        await searchInput.type(videoTitle, { delay: turboMode ? 20 : 35 + Math.floor(Math.random() * 25) });
        await sleep(400);
        await page.keyboard.press('Enter');

        const exactLink = page.locator(`a[href*="/watch?v=${videoId}"], a[href*="/shorts/${videoId}"]`).first();
        await exactLink.waitFor({ state: 'visible', timeout: 9000 });
        await sleep(turboMode ? 350 : 650 + Math.floor(Math.random() * 500));
        await exactLink.click({ timeout: 5000 });
        await sleep(1600);
        mode = 'youtube-search';
      } catch (_) {
        await page.goto(cleanWatchUrl, {
          waitUntil: 'domcontentloaded',
          referer: ytSearchReferer,
          timeout: navTimeout(),
        });
        mode = 'yt-search-referer';
      }
    } else if (roll < 0.80) {
      console.log(`[VIEWS] ${profileName} [Google Organic] Opening exact video [${videoId}]`);
      await page.goto(cleanWatchUrl, {
        waitUntil: 'domcontentloaded',
        referer: googleReferer,
        timeout: navTimeout(),
      });
      mode = 'google-organic';
    } else {
      console.log(`[VIEWS] ${profileName} [YouTube Browse] Warming up feed & opening exact video [${videoId}]`);
      await page.goto('https://www.youtube.com/', {
        waitUntil: 'domcontentloaded',
        timeout: navTimeout(),
      }).catch(() => {});
      await sleep(1600 + Math.floor(Math.random() * 900));
      await this._dismissBanners(page).catch(() => {});
      await page.evaluate(() => window.scrollBy({ top: 280, behavior: 'smooth' })).catch(() => {});
      await sleep(800);
      await page.goto(cleanWatchUrl, {
        waitUntil: 'domcontentloaded',
        referer: 'https://www.youtube.com/',
        timeout: navTimeout(),
      });
      mode = 'youtube-browse';
    }

    if (videoId && !page.url().includes(videoId)) {
      await page.goto(cleanWatchUrl, {
        waitUntil: 'domcontentloaded',
        referer: ytSearchReferer,
        timeout: navTimeout(),
      });
      mode = 'enforced-exact-url';
    }

    console.log(`[VIEWS] ${profileName} ✅ Locked on exact video [${videoId}] via ${mode}`);
    return mode;
  }

  async _clickGoogleNext(page) {
    const selectors = ['#identifierNext button', '#passwordNext button', 'button:has-text("Next")'];
    for (const sel of selectors) {
      const loc = page.locator(sel).first();
      if (await loc.isVisible({ timeout: 800 }).catch(() => false)) {
        await loc.click({ timeout: 3000 }).catch(() => {});
        return true;
      }
    }
    await page.keyboard.press('Enter').catch(() => {});
    return false;
  }

  async _autoGoogleLogin(page, botName, email, password) {
    await page.goto(
      'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F&hl=en',
      { waitUntil: 'domcontentloaded', timeout: navTimeout() }
    );
    await sleep(2000);
    const emailSel = 'input[type="email"], input[name="identifier"]';
    await page.waitForSelector(emailSel, { timeout: 25000, state: 'visible' });
    await page.type(emailSel, email, { delay: 40 });
    await this._clickGoogleNext(page);
    await sleep(3000);

    const passSel = 'input[type="password"], input[name="Passwd"]';
    await page.waitForSelector(passSel, { timeout: 25000, state: 'visible' });
    await page.type(passSel, password, { delay: 35 });
    await this._clickGoogleNext(page);
    await sleep(4000);
    return await this._isLoggedIn(page);
  }

  async registerAndLoginBot(botName, opts = {}) {
    const email = (opts.email || '').trim();
    const password = opts.password || '';
    if (!(email && password)) return this._registerManualCloseToSave(botName);

    const { browser, page, localAnonymizedUrl } = await this._launchWithProfile(botName, { headless: false, forLogin: true });
    try {
      await this._autoGoogleLogin(page, botName, email, password);
      const cookies = normalizeCookies(await this._getCookies(browser));
      if (!hasAuthCookies(cookies)) throw new Error('No auth cookies found');

      let bot = await Bot.findOne({ botName });
      if (bot) {
        bot.cookies = cookies;
        bot.updatedAt = new Date();
        await bot.save();
      } else {
        bot = await Bot.create({ botName, cookies });
      }
      return bot;
    } finally {
      await browser.close().catch(() => {});
      if (localAnonymizedUrl) await proxyChain.closeAnonymizedProxy(localAnonymizedUrl, true).catch(() => {});
    }
  }

  async _registerManualCloseToSave(botName) {
    const { browser, page, localAnonymizedUrl } = await this._launchWithProfile(botName, { headless: false, forLogin: true });
    await page.goto('about:blank').catch(() => {});
    await new Promise((resolve) => browser.on('close', resolve));
    if (localAnonymizedUrl) await proxyChain.closeAnonymizedProxy(localAnonymizedUrl, true).catch(() => {});

    const { browser: browser2, localAnonymizedUrl: local2 } = await this._launchWithProfile(botName, { headless: true, forLogin: true });
    const cookies = normalizeCookies(await this._getCookies(browser2));
    await browser2.close().catch(() => {});
    if (local2) await proxyChain.closeAnonymizedProxy(local2, true).catch(() => {});

    if (!hasAuthCookies(cookies)) throw new Error('No YouTube auth cookies found.');
    let bot = await Bot.findOne({ botName });
    if (bot) {
      bot.cookies = cookies;
      bot.updatedAt = new Date();
      await bot.save();
    } else {
      bot = await Bot.create({ botName, cookies });
    }
    return bot;
  }

  async registerBotsFromCsv(csvText) {
    const lines = String(csvText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const results = { ok: [], failed: [] };
    for (let i = 0; i < lines.length; i++) {
      const [email, password, botName] = lines[i].split(',').map((s) => (s || '').trim());
      if (!email || !password) continue;
      const finalName = botName || email.split('@')[0];
      try {
        const bot = await this.registerAndLoginBot(finalName, { email, password });
        results.ok.push({ botName: bot.botName, email });
      } catch (err) {
        results.failed.push({ email, error: err.message });
      }
    }
    return results;
  }

  async refreshBotLogin(botName) {
    return this.registerAndLoginBot(botName);
  }

  async importBotFromCookies(botName, cookiesRaw) {
    const list = typeof cookiesRaw === 'string' ? JSON.parse(cookiesRaw) : cookiesRaw;
    const cookies = normalizeCookies(list);
    if (!hasAuthCookies(cookies)) throw new Error('No YouTube auth cookies found.');
    let bot = await Bot.findOne({ botName });
    if (bot) {
      bot.cookies = cookies;
      bot.updatedAt = new Date();
      await bot.save();
    } else {
      bot = await Bot.create({ botName, cookies });
    }
    return bot;
  }

  async importBotsFromCookiesBulk(payload) {
    const items = Array.isArray(payload) ? payload : payload.bots || [];
    const results = { ok: [], failed: [] };
    for (const row of items) {
      try {
        const bot = await this.importBotFromCookies(row.botName, row.cookies);
        results.ok.push({ botName: bot.botName });
      } catch (e) {
        results.failed.push({ botName: row.botName, error: e.message });
      }
    }
    return results;
  }

  async performActionWithBot(videoUrl, botData, options = {}) {
    const watchHours = !!options.watchHours;
    const viewOnly = !!options.viewOnly || watchHours;
    const doLike = viewOnly ? false : options.doLike !== false;
    const doComment = viewOnly ? false : !!options.doComment;
    const commentText = doComment ? (options.commentText || pickRandomComment(options.comments)) : null;

    const isHeadless = false;
    const { browser, page, proxyObj, localAnonymizedUrl } = await this._launchWithProfile(botData.botName, { headless: isHeadless });

    const result = {
      botName: botData.botName,
      success: false,
      liked: false,
      alreadyLiked: false,
      commented: false,
      commentText: commentText || null,
      error: null,
      watchedSeconds: 0,
    };

    try {
      await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded', timeout: navTimeout() });
      await sleep(2000);
      await this._dismissBanners(page);

      if (!(await this._isLoggedIn(page))) {
        const cookies = normalizeCookies(botData.cookies || []);
        await browser.addCookies(cookies).catch(() => {});
        await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded', timeout: navTimeout() });
        await sleep(2000);
      }

      if (!(await this._isLoggedIn(page))) throw new Error('Session expired');

      await page.goto(videoUrl, { waitUntil: 'domcontentloaded', timeout: navTimeout() });
      await sleep(2500);
      await this._dismissBanners(page);
      await simulateHumanBehavior(page, botData.botName).catch(() => {});
      await this._humanStartVideo(page, botData.botName);

      const watchSec = await this._watchVideo(page, botData.botName, { viewOnly: !!options.viewOnly, watchHours });
      result.watchedSeconds = watchSec;

      if (doLike) {
        const likeResult = await this._clickLike(page, botData.botName);
        result.liked = !!likeResult.success && !likeResult.alreadyLiked;
        result.alreadyLiked = !!likeResult.alreadyLiked;
      }

      if (doComment && commentText) {
        await this._postComment(page, botData.botName, commentText);
        result.commented = true;
      }

      result.success = true;
    } catch (err) {
      result.error = err.message;
      if (proxyObj && /ERR_|SSL_|Timeout/i.test(err.message)) this._markProxyExhausted(proxyObj, err.message);
    } finally {
      await browser.close().catch(() => {});
      if (localAnonymizedUrl) await proxyChain.closeAnonymizedProxy(localAnonymizedUrl, true).catch(() => {});
    }

    return result;
  }

  async performLikeWithBot(videoUrl, botData) {
    return this.performActionWithBot(videoUrl, botData, { doLike: true, doComment: false });
  }

  async _watchVideo(page, botName, opts = {}) {
    const watchHours = !!opts.watchHours;
    const viewOnly = !!opts.viewOnly;
    const turboMode = !!opts.turboMode;
    const statsTracker = opts.statsTracker || null;
    const countAsView = viewOnly || watchHours;
    const targetVolume = Number((0.25 + Math.random() * 0.20).toFixed(2));

    try {
      const playerLoc = page.locator('#movie_player video, #movie_player').first();
      await playerLoc.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
      await sleep(500);

      const isPaused = await page.evaluate(() => {
        const v = document.querySelector('video');
        return !v || v.paused || v.currentTime === 0;
      }).catch(() => true);

      if (isPaused) {
        await playerLoc.click({ force: true, timeout: 4000 }).catch(() => {});
        await page.keyboard.press('k').catch(() => {});
        await sleep(700);
      }

      await this._forceLowestQuality(page);

      await page.evaluate(async (vol) => {
        const video = document.querySelector('video');
        if (!video) return;
        video.muted = false;
        video.volume = vol;
        if (video.paused) {
          await video.play().catch(async () => {
            video.muted = true;
            await video.play().catch(() => {});
            setTimeout(() => {
              video.muted = false;
              video.volume = vol;
            }, 800);
          });
        }
        const muteBtn = document.querySelector('button.ytp-mute-button');
        if (muteBtn && (muteBtn.getAttribute('aria-label') || '').toLowerCase().includes('unmute')) {
          muteBtn.click();
        }
      }, targetVolume);
    } catch (_) {}

    let maxPlayed = 0;
    let isUnmuted = true;

    if (countAsView) {
      await sleep(15000);
      await this._dismissBanners(page).catch(() => {});
      await this._skipAdsIfPresent(page, botName);
      await this._forceLowestQuality(page);

      const playerCrash = await page.evaluate(() => {
        const bodyText = document.body ? document.body.innerText : '';
        return bodyText.includes('Something went wrong') || !!document.querySelector('.ytp-error, #error-screen');
      }).catch(() => false);

      if (playerCrash) {
        throw new Error('YouTube player error (Something went wrong) - rotating IP');
      }

      const check15 = await page.evaluate((vol) => {
        const v = document.querySelector('video');
        if (!v) return { time: 0, unmuted: false };
        if (v.muted) {
          v.muted = false;
          v.volume = vol;
        }
        if (v.paused) v.play().catch(() => {});
        return { time: v.currentTime, unmuted: !v.muted && v.volume > 0 };
      }, targetVolume).catch(() => ({ time: 0, unmuted: false }));

      maxPlayed = Math.max(maxPlayed, check15.time);
      isUnmuted = check15.unmuted;

      if (maxPlayed < 1.5) {
        throw new Error(`Stream stalled at ${maxPlayed.toFixed(1)}s in first 15s`);
      }
    }

    const minSec = turboMode ? 40 : (parseInt(process.env.VIEW_WATCH_TIME_MIN || '60', 10));
    const maxSec = turboMode ? 55 : (parseInt(process.env.VIEW_WATCH_TIME_MAX || '115', 10));
    let targetSec = minSec + Math.floor(Math.random() * (Math.max(minSec, maxSec) - minSec + 1));

    try {
      const dur = await page.evaluate(() => {
        const v = document.querySelector('video');
        return v && isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
      });
      if (dur >= 15 && dur < 60) {
        targetSec = Math.max(35, Math.floor(dur * 0.85));
      }
    } catch (_) {}

    const remainingSec = Math.max(35, targetSec - 15);
    console.log(`[${botName}] Unmuted (vol=${targetVolume}) verified (${maxPlayed.toFixed(1)}s)! Watching ${remainingSec}s more...`);

    const endAt = Date.now() + remainingSec * 1000;
    let step = 0;
    const didMicroPause = Math.random() < 0.35;

    while (Date.now() < endAt) {
      step++;
      if (step === 2) await this._dismissBanners(page).catch(() => {});
      await this._skipAdsIfPresent(page, botName);
      if (step === 1 || step % 5 === 0) await this._forceLowestQuality(page);

      const cur = await page.evaluate((vol) => {
        const v = document.querySelector('video');
        if (v) {
          if (v.muted) {
            v.muted = false;
            v.volume = vol;
          }
          if (v.paused && !v.ended) v.play().catch(() => {});
          return v.currentTime;
        }
        return 0;
      }, targetVolume).catch(() => 0);

      if (cur > maxPlayed) maxPlayed = cur;

      if (step % 3 === 0) {
        await page.mouse.move(
          200 + Math.random() * 820,
          170 + Math.random() * 340,
          { steps: 10 }
        ).catch(() => {});
      }

      if (didMicroPause && step === 7) {
        await page.keyboard.press('k').catch(() => {});
        await sleep(1400);
        await page.keyboard.press('k').catch(() => {});
      }

      if (step === 10) {
        await page.evaluate(() => window.scrollBy({ top: 420, behavior: 'smooth' })).catch(() => {});
      } else if (step === 15) {
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })).catch(() => {});
      }

      const left = endAt - Date.now();
      if (left <= 0) break;
      await sleep(Math.min(1500, left));
    }

    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v && !v.paused) v.pause();
    }).catch(() => {});
    await sleep(4000);

    const wtPings = statsTracker ? statsTracker.watchtimePings : -1;
    const qoePings = statsTracker ? statsTracker.qoePings : -1;
    console.log(
      `[${botName}] Watch done | played=${maxPlayed.toFixed(1)}s | unmuted=${isUnmuted} | watchtimePings=${wtPings} | qoePings=${qoePings}`
    );

    if (countAsView && maxPlayed < 40) {
      throw new Error(`Video played only ${maxPlayed.toFixed(1)}s (< 40s)`);
    }
    if (statsTracker && statsTracker.watchtimePings === 0) {
      throw new Error('YouTube server did not confirm watchtime ping');
    }

    return Math.round(maxPlayed);
  }

  async _humanStartVideo(page) {
    try {
      const playBtn = page.locator('.ytp-large-play-button, button.ytp-play-button').first();
      if (await playBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await playBtn.click({ timeout: 2000 }).catch(() => {});
      } else {
        await page.evaluate(() => {
          const v = document.querySelector('video');
          if (v && v.paused) {
            v.muted = false;
            v.volume = 0.35;
            v.play().catch(() => {});
          }
        });
      }
    } catch (_) {}
  }

  async _clickLike(page) {
    const btn = page.locator('like-button-view-model button, #segmented-like-button button').first();
    if ((await btn.count()) > 0) {
      await btn.click({ delay: 60 }).catch(() => {});
      return { success: true, alreadyLiked: false };
    }
    return { success: false, error: 'Like button not found' };
  }

  async _postComment(page, botName, text) {
    await page.evaluate(() => window.scrollBy(0, 600));
    await sleep(1500);
    const box = page.locator('#placeholder-area, #simplebox-placeholder').first();
    if ((await box.count()) > 0) {
      await box.click();
      await page.keyboard.type(text, { delay: 40 });
      const sub = page.locator('#submit-button button').first();
      if ((await sub.count()) > 0) await sub.click();
    }
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  async _pickRandomBots(count) {
    const all = await Bot.find();
    this._shuffle(all);
    return all.slice(0, Math.min(count, all.length));
  }

  async processActions(videoUrl, opts = {}) {
    const pool = await this._pickRandomBots(opts.botCount || 1);
    const concurrency = getBotConcurrency(pool.length);
    return runWithConcurrency(pool, concurrency, (bot) =>
      this.performActionWithBot(videoUrl, bot, opts)
    );
  }

  async processViews(videoUrl, opts = {}) {
    const count = Math.max(1, parseInt(opts.botCount, 10) || 1);
    const videoId = extractYoutubeVideoId(videoUrl);
    const profiles = pickGuestViewProfiles(count, videoId);
    const concurrency = Math.max(1, parseInt(process.env.BOT_CONCURRENCY_MAX || '2', 10) || 2);

    console.log(
      `[VIEWS] ${profiles.length} guest profile(s) | HEADED UNMUTED concurrency=${concurrency} | savedProxies=${proxyPool.proxies.length} → ${videoUrl}`
    );

    let videoTitle = opts.videoTitle || (await this._fetchYoutubeTitle(videoUrl, videoId).catch(() => null)) || videoId;
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

    const results = await runWithConcurrency(profiles, concurrency, async (profileName, index) => {
      await sleep((index % concurrency) * 4500 + 3500 + Math.floor(Math.random() * 5500));
      const result = await this._performGuestView(videoUrl, {
        profileName,
        videoId,
        videoTitle,
      }, 0, index);
      if (onProgress) {
        await onProgress(result).catch(() => {});
      }
      return result;
    });

    console.log(
      `[VIEWS] Done ${results.length} | success=${results.filter((r) => r && r.success).length}`
    );
    return results;
  }

  async _fetchYoutubeTitle(videoUrl, videoId) {
    const id = videoId || extractYoutubeVideoId(videoUrl);
    const oembed = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`;
    try {
      const axios = require('axios');
      const { data } = await axios.get(oembed, { timeout: 8000 });
      if (data && data.title) {
        const title = String(data.title).trim();
        const author = data.author_name ? String(data.author_name).trim() : '';
        return author ? `${title} ${author}` : title;
      }
    } catch (_) {}
    return id || null;
  }

  async _upsertViewBotDb(profileName, patch = {}) {
    try {
      const update = { ...patch, profileName, updatedAt: new Date() };
      if (Array.isArray(patch.cookies)) update.cookieCount = patch.cookies.length;
      return await ViewBot.findOneAndUpdate(
        { profileName },
        { $set: update, $setOnInsert: { createdAt: new Date() } },
        { upsert: true, new: true }
      );
    } catch (_) {
      return null;
    }
  }

  async _launchGuestViewProfile(profileName, retryAttempt = 0, indexOverride = null) {
    const userDataDir = profileDir(profileName);
    const { args: baseArgs, width, height, lowMem } = vmwareArgs();
    let args = [...baseArgs];

    const stripFlags = new Set([
      '--headless',
      '--headless=new',
      '--mute-audio',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--single-process',
      '--in-process-gpu',
      '--no-zygote',
      '--renderer-process-limit=1',
    ]);
    args = args.filter((a) => !stripFlags.has(a) && !String(a).startsWith('--headless'));

    if (!args.includes('--disable-blink-features=AutomationControlled')) {
      args.push('--disable-blink-features=AutomationControlled');
    }
    args.push(
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-device-for-media-stream',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      '--disable-infobars',
      '--no-default-browser-check',
      '--no-first-run',
      '--window-size=1366,768'
    );

    const browserBrand = 'Google Chrome';
    const engine = 'chromium';
    const skipIndex = (indexOverride !== null ? indexOverride : 0) + retryAttempt;
    const proxyObj = await this._getReusableProxy(profileName, false, skipIndex);

    const fp = buildFingerprint(profileName, { lowMem, browserBrand, proxyGeo: proxyObj });
    fp.browserBrand = browserBrand;
    fp.engine = engine;

    let localAnonymizedUrl = null;
    if (proxyObj) {
      fp.timezoneId = proxyObj.timezoneId || fp.timezoneId;
      fp.locale = proxyObj.locale || fp.locale;
      const rawProxyUrl = buildAuthProxyUrl(proxyObj, `${profileName}_${Date.now()}`);
      localAnonymizedUrl = await proxyChain.anonymizeProxy(rawProxyUrl);
      console.log(`[VIEWS-PROXY] [${profileName}] Proxy: ${proxyObj.username || proxyObj.server} (${proxyObj.timezoneId})`);
    } else {
      console.log(`[VIEWS-PROXY] [${profileName}] Using Direct IP`);
    }

    logFingerprint(fp);

    await this._upsertViewBotDb(profileName, {
      fingerprint: fp,
      browserBrand,
      engine,
    });

    const fpOpts = contextOptionsFromFp(fp);
    const useHeaded = process.env.HEADLESS !== 'true' && (process.platform === 'win32' || !!process.env.DISPLAY);
    const launchOpts = {
      headless: !useHeaded,
      args,
      ignoreDefaultArgs: ['--enable-automation', '--mute-audio'],
      ...fpOpts,
      viewport: lowMem ? { width: width || 1024, height: height || 576 } : fpOpts.viewport || { width: 1366, height: 768 },
    };

    if (localAnonymizedUrl) {
      launchOpts.proxy = { server: localAnonymizedUrl };
    }

    delete launchOpts.executablePath;
    delete launchOpts.channel;

    const context = await chromium.launchPersistentContext(userDataDir, launchOpts);

    try {
      await context.addInitScript(fingerprintInitScript(fp), initScriptPayload(fp));
      await context.setExtraHTTPHeaders(clientHintHeaders(fp)).catch(() => {});
      await context.addCookies([
        {
          name: 'SOCS',
          value: 'CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjMwODI5LjA3X3AxGgJlbiACGgYIgJnPpwY',
          domain: '.youtube.com',
          path: '/',
          secure: true,
          sameSite: 'Lax',
        },
      ]).catch(() => {});
    } catch (_) {}

    await this._enableSafeDataSaver(context);

    const page = context.pages()[0] || (await context.newPage());
    return { context, page, profileName, userDataDir, browserBrand, engine, fingerprint: fp, proxyObj, localAnonymizedUrl, isHeaded: useHeaded };
  }
  async _performGuestView(videoUrl, { profileName, videoId, videoTitle }, retryAttempt = 0, indexOverride = null) {
    const result = {
      botName: profileName,
      success: false,
      viewed: false,
      watchedSeconds: 0,
      error: null,
      profile: profileName,
    };

    let context;
    let currentProxy = null;
    let localProxyTunnel = null;

    try {
      if (videoId && isViewProfileOnCooldown(profileName, videoId)) {
        throw new Error(`Profile ${profileName} on 72h cooldown`);
      }

      const launched = await this._launchGuestViewProfile(profileName, retryAttempt, indexOverride);
      context = launched.context;
      currentProxy = launched.proxyObj;
      localProxyTunnel = launched.localAnonymizedUrl;
      const page = launched.page;
      const turboMode = !!(currentProxy && currentProxy.unlimitedHourly);

      const statsTracker = { watchtimePings: 0, qoePings: 0 };
      page.on('response', (res) => {
        const u = res.url();
        if (res.status() >= 200 && res.status() < 400) {
          if (u.includes('/api/stats/watchtime') || u.includes('/api/stats/playback')) {
            statsTracker.watchtimePings++;
          }
          if (u.includes('/api/stats/qoe')) {
            statsTracker.qoePings++;
          }
        }
      });

      const cleanWatchUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : videoUrl;
      if (!cleanWatchUrl) throw new Error('No videoUrl');

      await this._navigateToExactVideo(page, {
        videoId,
        videoTitle,
        cleanWatchUrl,
        profileName,
        turboMode,
      });
      await sleep(2000);

      await this._dismissBanners(page).catch(() => {});
      await page.waitForSelector('video, #movie_player', { timeout: actionTimeout() }).catch(() => {});
      await simulateHumanBehavior(page, profileName).catch(() => {});
      await this._humanStartVideo(page);
      await this._skipAdsIfPresent(page, profileName);

      const watchSec = await this._watchVideo(page, profileName, {
        viewOnly: true,
        watchHours: false,
        turboMode,
        statsTracker,
      });
      result.watchedSeconds = watchSec;
      result.viewed = true;
      result.success = true;

      if (videoId) markViewProfileWatched(profileName, videoId);

      try {
        const cookies = normalizeCookies((await context.cookies()) || []);
        const cooldownPatch = videoId ? { [`videoCooldown.${videoId}`]: new Date() } : {};
        await ViewBot.findOneAndUpdate(
          { profileName },
          {
            $set: {
              cookies,
              cookieCount: cookies.length,
              lastVideoId: videoId || '',
              lastWatchedAt: new Date(),
              updatedAt: new Date(),
              ...cooldownPatch,
            },
            $inc: { totalViews: 1 },
            $setOnInsert: { createdAt: new Date() },
          },
          { upsert: true }
        );
      } catch (_) {}

      console.log(
        `[VIEWS] ${profileName} ✅ REALTIME-VERIFIED (${watchSec}s | headed=${launched.isHeaded} | watchtimePings=${statsTracker.watchtimePings} | Proxy: ${currentProxy ? currentProxy.username : 'Direct'})`
      );
    } catch (err) {
      result.error = err.message || String(err);
      console.error(`[VIEWS] ${profileName} failed (Attempt ${retryAttempt + 1}):`, result.error);

      if (context) {
        await context.close().catch(() => {});
        context = null;
      }
      if (localProxyTunnel) {
        await proxyChain.closeAnonymizedProxy(localProxyTunnel, true).catch(() => {});
        localProxyTunnel = null;
      }

      const isHardProxyAuthOrQuotaErr = /ERR_PROXY|407|402|502|TUNNEL_CONNECTION_FAILED|ECONNRESET/i.test(result.error);
      if (currentProxy && isHardProxyAuthOrQuotaErr) {
        this._markProxyExhausted(currentProxy, result.error);
      }

      const maxRetries = Math.max(4, proxyPool.proxies.length);
      if (currentProxy && retryAttempt < maxRetries) {
        console.log(`[VIEWS-RETRY] ${profileName} retrying with next Oxylabs account...`);
        return this._performGuestView(videoUrl, { profileName, videoId, videoTitle }, retryAttempt + 1, indexOverride);
      }
    } finally {
      if (context) await context.close().catch(() => {});
      if (localProxyTunnel) await proxyChain.closeAnonymizedProxy(localProxyTunnel, true).catch(() => {});
    }

    return result;
  }

  async processWatchHours(videoUrl, opts = {}) {
    const pool = await this._pickRandomBots(opts.botCount || 1);
    return runWithConcurrency(pool, getBotConcurrency(pool.length), (bot) =>
      this.performActionWithBot(videoUrl, bot, { watchHours: true, viewOnly: true, doLike: false })
    );
  }

  async processMultipleLikes(videoUrl, botCount) {
    return this.processActions(videoUrl, { botCount, doLike: true, doComment: false });
  }

  async processSubscribe(url, opts = {}) {
    const pool = await this._pickRandomBots(opts.botCount || 1);
    return runWithConcurrency(pool, getBotConcurrency(pool.length), (bot) =>
      this.performSubscribeWithBot(url, bot)
    );
  }

  async performSubscribeWithBot(url, botData) {
    const { browser, page, localAnonymizedUrl } = await this._launchWithProfile(botData.botName, { headless: false });
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeout() });
      const btn = page.locator('ytd-subscribe-button-renderer button').first();
      if ((await btn.count()) > 0) await btn.click();
      return { botName: botData.botName, success: true };
    } catch (err) {
      return { botName: botData.botName, success: false, error: err.message };
    } finally {
      await browser.close().catch(() => {});
      if (localAnonymizedUrl) await proxyChain.closeAnonymizedProxy(localAnonymizedUrl, true).catch(() => {});
    }
  }
}

module.exports = new BotService();