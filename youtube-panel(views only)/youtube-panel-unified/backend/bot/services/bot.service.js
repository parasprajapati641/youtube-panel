const path = require('path');
const fs = require('fs');
const { chromium, firefox, webkit } = require('playwright');
const Bot = require('../models/bot.model');
const BotLike = require('../models/botLike.model');
const ViewBot = require('../models/viewBot.model');
const { normalizeCookies, hasAuthCookies } = require('../utils/cookie.util');
const { findChromePath, findBrowserPath, vmwareArgs } = require('../utils/browser.util');
const {
  buildFingerprint,
  contextOptionsFromFp,
  fingerprintInitScript,
  logFingerprint,
  clientHintHeaders,
  initScriptPayload,
  // CHANGE: multi-browser brand helpers (stable per view profile)
  BROWSER_BRANDS,
  pickStableBrowserBrand,
  getEngineForBrand,
  getBrandMeta,
} = require('../utils/fingerprint.util');
const { generateCommentsForVideo } = require('../utils/smartComment.util');


const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Browser kinds used for anonymous Views (no login).
 * Rotated so each view session can use a different engine.
 * - chrome / chromium / brave → Chromium family
 * - firefox
 * - webkit ≈ Safari-like engine (real Safari only on macOS)
 *
 * CHANGE: Prefer brand-based assignment from fingerprint.util (BROWSER_BRANDS).
 * This list is kept as a fallback for older code paths.
 */
const VIEW_BROWSER_KINDS = ['chrome', 'chromium', 'brave', 'firefox', 'webkit'];

function pickViewBrowserKind(index = 0) {
  const envList = (process.env.VIEW_BROWSERS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const list = envList.length ? envList : VIEW_BROWSER_KINDS;
  return list[index % list.length];
}

/**
 * Concurrent bots/sessions – values ONLY from .env.
 * Code does not force 3 / 10 / 50. Whatever you set in .env is used after restart.
 *
 * .env:
 *   BOT_CONCURRENCY_PERCENT=10
 *   BOT_CONCURRENCY_MIN=3
 *   BOT_CONCURRENCY_MAX=50
 *
 * Fallback (only if key missing in .env):
 *   PERCENT → 100 (all at once)
 *   MIN → 1
 *   MAX → order size
 */
function getBotConcurrency(totalBots) {
  const total = Math.max(1, parseInt(totalBots, 10) || 1);

  const minRaw = process.env.BOT_CONCURRENCY_MIN;
  const maxRaw = process.env.BOT_CONCURRENCY_MAX;
  const percentRaw =
    process.env.BOT_CONCURRENCY_PERCENT || process.env.BOT_CONCURRENCY_PER_100;

  const min = Math.max(
    1,
    parseInt(minRaw !== undefined && minRaw !== '' ? minRaw : '1', 10) || 1
  );
  const max = Math.max(
    min,
    parseInt(maxRaw !== undefined && maxRaw !== '' ? maxRaw : String(total), 10) || total
  );
  const percent = Math.max(
    1,
    parseInt(percentRaw !== undefined && percentRaw !== '' ? percentRaw : '100', 10) || 100
  );

  let c = Math.round((total * percent) / 100);
  if (c < min) c = min;
  if (c > max) c = max;

  return Math.min(c, total);
}

/**
 * Run items with limited concurrency (worker pool).
 */
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

/** Slow free proxies need longer timeouts – set via .env */
function navTimeout() {
  // NAV_TIMEOUT_MS=120000 or SLOW_PROXY=true → 120s default
  if (process.env.NAV_TIMEOUT_MS) return parseInt(process.env.NAV_TIMEOUT_MS, 10) || 120000;
  if (process.env.SLOW_PROXY === 'true' || process.env.PROXY_SLOW === 'true') return 120000;
  return 90000; // default 90s (was 60s)
}
function actionTimeout() {
  if (process.env.ACTION_TIMEOUT_MS) return parseInt(process.env.ACTION_TIMEOUT_MS, 10) || 30000;
  if (process.env.SLOW_PROXY === 'true' || process.env.PROXY_SLOW === 'true') return 45000;
  return 30000;
}
function selTimeout() {
  if (process.env.SEL_TIMEOUT_MS) return parseInt(process.env.SEL_TIMEOUT_MS, 10) || 20000;
  if (process.env.SLOW_PROXY === 'true' || process.env.PROXY_SLOW === 'true') return 25000;
  return 15000;
}

const DEFAULT_COMMENTS = [
  'Nice video! 🔥',
  'Great content, keep it up!',
  'Really enjoyed this 👍',
  'Awesome, thanks for sharing!',
  'Love this video ❤️',
  'Very informative and helpful!',
  'Super clean explanation, awesome job!',
  'Top quality video, thanks!',
  'Really well done! Looking forward to more!',
  'Great work! Very engaging content!',
  'Fantastic content! Keep up the good work!',
  'This is super helpful, thanks a lot!',
  'Awesome presentation and quality!',
  'Great explanation! Easy to follow!',
  'Outstanding production quality!',
  'Clear, concise and super helpful!',
  'Amazing explanation, thanks for sharing!',
  'Brilliant content as always!',
  'Super helpful tutorial, thank you!',
  'Loved the detailed breakdown!',
  'Very good content, highly appreciated!',
  'Keep making amazing videos like this!',
  'Subbed and liked! Excellent video!',
  'Nice video! Really enjoyed watching!',
  'Great job on this video! Really helpful!'
];

// Persistent profile isolation: each bot gets its own userDataDir
// Default: <cwd>/profiles/bot_<ID>
// Ignore bare /profiles or \profiles (causes Windows drive-root path + Chrome crash exit 21)
function resolveProfilesRoot() {
  const envRoot = (process.env.PROFILES_ROOT || '').trim();
  if (
    !envRoot ||
    envRoot === '/profiles' ||
    envRoot === '\\profiles' ||
    envRoot === '/profiles/' ||
    envRoot === 'profiles'
  ) {
    return path.join(process.cwd(), 'profiles');
  }
  if (!path.isAbsolute(envRoot)) {
    return path.resolve(process.cwd(), envRoot);
  }
  return envRoot;
}

const PROFILES_ROOT = resolveProfilesRoot();
if (!fs.existsSync(PROFILES_ROOT)) {
  fs.mkdirSync(PROFILES_ROOT, { recursive: true });
}
console.log('[PROFILES] Using root:', PROFILES_ROOT);

function profileDir(botName) {
  let safe = String(botName).replace(/[^a-zA-Z0-9_-]/g, '_');
  // Keep view_bot_001 style as-is (guest view profiles)
  if (/^view_bot_/i.test(safe)) {
    // ok
  } else if (!safe.toLowerCase().startsWith('bot_') && !safe.toLowerCase().startsWith('bot-')) {
    safe = `bot_${safe}`;
  } else {
    safe = safe.replace(/^bot[-_]/i, 'bot_');
  }
  const dir = path.join(PROFILES_ROOT, safe);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Guest view profile name: view_bot_001, view_bot_002, ... */
function viewProfileName(index1Based) {
  const n = Math.max(1, parseInt(index1Based, 10) || 1);
  return `view_bot_${String(n).padStart(3, '0')}`;
}

const VIEW_COOLDOWN_MS = () => {
  const h = parseInt(process.env.VIEW_COOLDOWN_HOURS || '48', 10);
  return Math.max(1, isNaN(h) ? 48 : h) * 3600 * 1000;
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
    const p = viewCooldownPath(profileName);
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn(`[VIEWS] cooldown save fail ${profileName}:`, e.message);
  }
}

function isViewProfileOnCooldown(profileName, videoId) {
  if (!videoId) return false;
  const data = loadViewCooldown(profileName);
  const ts = data[videoId];
  if (!ts) return false;
  return Date.now() - Number(ts) < VIEW_COOLDOWN_MS();
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
      u.match(/\/embed\/([a-zA-Z0-9_-]{6,})/);
    return m ? m[1] : null;
  } catch (_) {
    return null;
  }
}

/**
 * Pick N guest view profiles not on 48h cooldown for this videoId.
 * Creates profiles/view_bot_001 ... as needed (never deletes them).
 */
function pickGuestViewProfiles(count, videoId) {
  const need = Math.max(1, parseInt(count, 10) || 1);
  const maxPool = Math.max(
    need,
    parseInt(process.env.VIEW_PROFILE_POOL_MAX || '5000', 10) || 5000
  );
  const picked = [];
  let idx = 1;
  while (picked.length < need && idx <= maxPool) {
    const name = viewProfileName(idx);
    profileDir(name); // ensure folder exists
    if (!isViewProfileOnCooldown(name, videoId)) {
      picked.push(name);
    }
    idx++;
  }
  // If still short (all on cooldown), take next fresh indices beyond scanned
  while (picked.length < need && idx <= maxPool + need) {
    const name = viewProfileName(idx);
    profileDir(name);
    picked.push(name);
    idx++;
  }
  return picked;
}

const WARMUP_KEYWORDS = [
  'music',
  'news today',
  'funny videos',
  'cooking recipe',
  'football highlights',
  'tech review',
  'travel vlog',
  'lofi hip hop',
  'nature documentary',
  'how to',
];

function normalizeCommentList(comments) {
  const list =
    Array.isArray(comments) && comments.length > 0
      ? comments.filter((c) => typeof c === 'string' && c.trim()).map((c) => c.trim())
      : [...DEFAULT_COMMENTS];
  return list.length ? list : [...DEFAULT_COMMENTS];
}

function pickRandomComment(comments) {
  const list = normalizeCommentList(comments);
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * `count` different comments – shuffle without replacement; reshuffle if more bots than lines.
 */
function pickUniqueComments(comments, count) {
  const bank = normalizeCommentList(comments);
  const out = [];
  let pool = [];
  for (let i = 0; i < count; i++) {
    if (!pool.length) {
      pool = [...bank];
      for (let j = pool.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [pool[j], pool[k]] = [pool[k], pool[j]];
      }
    }
    out.push(pool.pop());
  }
  return out;
}

class BotService {
  /**
   * Launch persistent Chromium context (Playwright) – one profile dir per bot.
   * Works on bare metal + VMware (set VMWARE=true in .env).
   */
  async _launchWithProfile(botName, { headless = false, forLogin = false } = {}) {
    const userDataDir = profileDir(botName);
    const chromePath = findChromePath();
    const { args: baseArgs, width, height, lowMem } = vmwareArgs();
    let args = [...baseArgs];

    // Login attempts: avoid flags that cause black screen / Google reject
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
      args.push('--disable-blink-features=AutomationControlled');
      args.push('--force-color-profile=srgb');
    }

    if (!headless && !lowMem) args.push('--start-maximized');

    // ========== PROXY DISABLED (commented out – do not delete) ==========
    // const selectedProxy = this._pickProxy();
    // let proxyConfig = undefined;
    // // Optional: skip proxy for login (some free proxies trigger Google rejected)
    // const useProxyForLogin = process.env.LOGIN_USE_PROXY !== 'false';
    // if (selectedProxy && (!forLogin || useProxyForLogin)) {
    //   proxyConfig = { server: selectedProxy.server };
    //   if (selectedProxy.auth) {
    //     proxyConfig.username = selectedProxy.auth.username;
    //     proxyConfig.password = selectedProxy.auth.password;
    //   } else if (process.env.PROXY_USER && process.env.PROXY_PASS) {
    //     proxyConfig.username = process.env.PROXY_USER;
    //     proxyConfig.password = process.env.PROXY_PASS;
    //   }
    //   const safeLog = proxyConfig.username
    //     ? selectedProxy.server.replace('://', `://${proxyConfig.username}:****@`)
    //     : selectedProxy.server;
    //   console.log('[PROXY] Auto-selected:', safeLog);
    // } else if (forLogin && selectedProxy && !useProxyForLogin) {
    //   console.log('[PROXY] Skipped for login (LOGIN_USE_PROXY=false)');
    // }
    const selectedProxy = null;
    let proxyConfig = undefined;
    // ========== END PROXY DISABLED ==========

    // ========== Per-bot fingerprint FIRST (before any YouTube open) ==========
    // Same botName → stable FP; different bots → different FP (safe for concurrent bots)
    // CHANGE: each bot also gets a stable browserBrand (UA spoof). Logged-in bots stay on
    // chromium engine (profile cookies already tied to chromium); views use multi-engine.
    const fpLowMem =
      lowMem ||
      process.env.LOW_MEMORY === 'true' ||
      process.env.LOW_RAM === 'true' ||
      process.env.VMWARE === 'true';
    const botBrand = pickStableBrowserBrand(botName);
    const fp = buildFingerprint(botName, { lowMem: fpLowMem, browserBrand: botBrand });
    logFingerprint(fp);
    const fpOpts = contextOptionsFromFp(fp);

    const launchOpts = {
      headless: !!headless,
      args,
      ignoreDefaultArgs: ['--enable-automation'],
      ...fpOpts,
      // Low-mem / VMware: force smaller viewport from vmwareArgs
      viewport: fpLowMem
        ? { width: width || 1024, height: height || 576 }
        : fpOpts.viewport,
    };

    // Prefer system browser (Brave first, then Chrome). Avoid channel=chrome when Brave is used.
    if (chromePath) {
      launchOpts.executablePath = chromePath;
      const isBrave = /brave/i.test(chromePath);
      console.log(
        `[LAUNCH] ${forLogin ? 'Login' : 'Bot'} using system ${isBrave ? 'Brave' : 'Chrome'}:`,
        chromePath
      );
    } else if (forLogin && process.env.USE_CHANNEL_CHROME !== 'false') {
      // Fallback only when no Brave/Chrome path found
      launchOpts.channel = 'chrome';
      console.log('[LAUNCH] Login using channel=chrome (no Brave/Chrome path found)');
    } else if (process.env.USE_CHANNEL_CHROME === 'true') {
      launchOpts.channel = 'chrome';
    }

    // PROXY DISABLED – do not attach proxy to launch
    // if (proxyConfig) {
    //   launchOpts.proxy = proxyConfig;
    // }

    if (process.env.SLOW_MO) {
      launchOpts.slowMo = parseInt(process.env.SLOW_MO, 10) || 50;
    } else if (forLogin) {
      launchOpts.slowMo = parseInt(process.env.LOGIN_SLOW_MO || '40', 10);
    }

    console.log(
      `[LAUNCH] Playwright profile=${userDataDir} headless=${!!headless} forLogin=${!!forLogin}`
    );

    let context;
    try {
      context = await chromium.launchPersistentContext(userDataDir, launchOpts);
    } catch (launchErr) {
      // PROXY DISABLED – no proxy-retry path
      // if (
      //   selectedProxy &&
      //   /proxy|ERR_PROXY|tunnel|ECONNREFUSED|net::|ERR_NO_SUPPORTED_PROXIES/i.test(
      //     String(launchErr.message)
      //   )
      // ) {
      //   console.error('[PROXY] Launch failed with proxy. Retrying WITHOUT proxy...');
      //   delete launchOpts.proxy;
      //   context = await chromium.launchPersistentContext(userDataDir, launchOpts);
      // } else {
      //   throw launchErr;
      // }
      throw launchErr;
    }

    // Fingerprint spoof BEFORE any page script / YouTube goto
    // Level 1: navigator, WebGL, canvas, audio, screen, rects, battery…
    await context.addInitScript(fingerprintInitScript(fp), initScriptPayload(fp));

    // Client Hints headers match spoofed UA (sec-ch-ua / platform)
    try {
      await context.setExtraHTTPHeaders(clientHintHeaders(fp));
    } catch (e) {
      console.warn(`[FP] ${botName} setExtraHTTPHeaders failed:`, e.message);
    }

    const pages = context.pages();
    const page = pages[0] || (await context.newPage());

    console.log(`[FP] ${botName} fingerprint applied – safe to open YouTube`);

    return { browser: context, context, page, fingerprint: fp };
  }




  _parseProxyString(raw) {
    if (!raw || typeof raw !== 'string') return null;
    let s = raw.trim();
    if (!s || s.startsWith('#')) return null;

    // Keep original scheme (socks5 vs http). Bug fix: old code stripped scheme then forced http://
    let scheme = 'http';
    const schemeMatch = s.match(/^(socks5?h?|https?):\/\//i);
    if (schemeMatch) {
      scheme = schemeMatch[1].toLowerCase();
      if (scheme === 'socks5h' || scheme === 'socks5') scheme = 'socks5';
      if (scheme === 'https') scheme = 'http'; // Playwright proxy server uses http:// for HTTP proxies
    } else if (
      (process.env.PROXY_TYPE || process.env.PROXY_SCHEME || '').toLowerCase() === 'socks5'
    ) {
      scheme = 'socks5';
    }

    let auth = null;
    // socks5://user:pass@host:port | http://user:pass@host:port | user:pass@host:port
    const atMatch =
      s.match(/^(?:https?|socks5?h?):\/\/([^:/@]+):([^@/]+)@(.+)$/i) ||
      s.match(/^([^:/@]+):([^@/]+)@(.+)$/);
    if (atMatch) {
      auth = { username: atMatch[1], password: atMatch[2] };
      s = atMatch[3]; // host:port only
      if (!/^(?:https?|socks5?h?):\/\//i.test(s)) {
        s = scheme + '://' + s;
      }
    } else if (!/^(?:https?|socks5?h?):\/\//i.test(s)) {
      // IP:PORT or host:port:user:pass
      const parts = s.split(':');
      if (parts.length === 4 && !s.includes('@')) {
        auth = { username: parts[2], password: parts[3] };
        s = scheme + '://' + parts[0] + ':' + parts[1];
      } else if (parts.length === 2) {
        s = scheme + '://' + parts[0] + ':' + parts[1];
      }
    }

    const server = s.replace(/\/$/, '');
    if (!server) return null;
    return { server, auth };
  }

  /** Load proxy list from file + env (cached, reload if PROXY_RELOAD=true). */
  _loadProxyList() {
    if (this._proxyListCache && process.env.PROXY_RELOAD !== 'true') {
      return this._proxyListCache;
    }
    const list = [];
    const files = [
      path.join(__dirname, '..', 'proxies.txt'),
      path.join(__dirname, '..', '..', 'proxies.txt'),
      path.join(process.cwd(), 'proxies.txt'),
      path.join(process.cwd(), 'bot', 'proxies.txt')
    ];
    for (const f of files) {
      try {
        if (!fs.existsSync(f)) continue;
        const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
        for (const line of lines) {
          const parsed = this._parseProxyString(line);
          if (parsed) list.push(parsed);
        }
        if (list.length) {
          console.log(`[PROXY] Loaded ${list.length} proxies from ${f}`);
          break;
        }
      } catch (_) {}
    }
    if (process.env.PROXY_LIST) {
      for (const p of process.env.PROXY_LIST.split(/[,;\n]/)) {
        const parsed = this._parseProxyString(p);
        if (parsed) list.push(parsed);
      }
    }
    if (list.length === 0 && process.env.PROXY_SERVER) {
      const p = process.env.PROXY_SERVER.trim();
      if (p && p !== 'http://IP:PORT') {
        const parsed = this._parseProxyString(p);
        if (parsed) list.push(parsed);
      }
    }
    this._proxyListCache = list;
    return list;
  }

  /**
   * Round-robin proxy: each next bot gets next IP in list.
   * After last proxy → back to first. Different IP per bot turn.
   */
  _pickProxy() {
    const list = this._loadProxyList();
    if (!list.length) return null;

    if (this._proxyRotateIndex == null) this._proxyRotateIndex = 0;
    const idx = this._proxyRotateIndex % list.length;
    this._proxyRotateIndex = idx + 1;

    const chosen = list[idx];
    console.log(
      `[PROXY] Rotate #${idx + 1}/${list.length} → ${chosen.server}` +
        (chosen.auth ? ` (user=${chosen.auth.username})` : '')
    );
    return chosen;
  }

  async _isLoggedIn(page) {
    try {
      return await page.evaluate(() => {
        const hasAvatar = !!(
          document.querySelector('#avatar-btn') ||
          document.querySelector('button#avatar-btn') ||
          document.querySelector('yt-img-shadow#avatar') ||
          document.querySelector('img.yt-spec-avatar-shape__image') ||
          document.querySelector('[id="avatar-btn"]')
        );
        const signIn =
          document.querySelector('a[aria-label="Sign in"]') ||
          document.querySelector('a[href*="ServiceLogin"]') ||
          [...document.querySelectorAll('a, button')].find(
            (el) => (el.textContent || '').trim().toLowerCase() === 'sign in'
          );
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
      await page.evaluate(() => {
        const texts = ['Accept all', 'I agree', 'Accept', 'Reject all'];
        for (const t of texts) {
          const btn = [...document.querySelectorAll('button')].find(
            (b) => (b.textContent || '').trim() === t
          );
          if (btn) {
            btn.click();
            break;
          }
        }
      });
    } catch (_) {}
  }

  /**
   * Detect YouTube ads and click Skip / close when available.
   * Call this often during watch loops so ads don't eat watch time
   * and the main video keeps playing.
   * Returns true if an ad was skipped or closed.
   */
  async _skipAdsIfPresent(page, botName = '') {
    try {
      const skipped = await page.evaluate(() => {
        const tryClick = (el) => {
          if (!el) return false;
          try {
            el.click();
            return true;
          } catch (_) {
            try {
              el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
              return true;
            } catch (__) {
              return false;
            }
          }
        };

        // Modern + classic skip buttons
        const skipSelectors = [
          '.ytp-ad-skip-button',
          '.ytp-ad-skip-button-modern',
          '.ytp-skip-ad-button',
          'button.ytp-ad-skip-button-modern',
          '.ytp-ad-skip-button-container button',
          '[class*="ytp-ad-skip"] button',
          'button[class*="skip"]',
          '.ytp-ad-overlay-close-button',
          '.ytp-ad-overlay-close-container button',
          'button.ytp-ad-overlay-close-button',
        ];

        for (const sel of skipSelectors) {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null) {
            if (tryClick(el)) return 'skip-btn';
          }
        }

        // Text-based fallback (Skip / Skip Ad / Skip Ads)
        const buttons = [...document.querySelectorAll('button, .ytp-button, a')];
        for (const b of buttons) {
          const t = (b.textContent || b.getAttribute('aria-label') || '').trim().toLowerCase();
          if (
            (t === 'skip' || t === 'skip ad' || t === 'skip ads' || t.startsWith('skip')) &&
            b.offsetParent !== null
          ) {
            if (tryClick(b)) return 'skip-text';
          }
        }

        // Close overlay ads
        const closeSelectors = [
          '.ytp-ad-overlay-close-button',
          '.ytp-ad-overlay-close-container',
          'button[aria-label*="Close"]',
          'button[aria-label*="close"]',
        ];
        for (const sel of closeSelectors) {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null) {
            if (tryClick(el)) return 'close-overlay';
          }
        }

        // If ad is showing but no skip yet, at least keep main player ready
        const adShowing =
          document.querySelector('.ad-showing') ||
          document.querySelector('.ytp-ad-player-overlay') ||
          document.querySelector('.ytp-ad-module') ||
          document.querySelector('[class*="ad-showing"]');
        if (adShowing) return 'ad-present';

        return false;
      });

      if (skipped && skipped !== 'ad-present') {
        if (botName) console.log(`[${botName}] Ad skipped (${skipped})`);
        await sleep(400 + Math.floor(Math.random() * 600));
        // After skip, force main video to resume if needed
        await page.evaluate(() => {
          const video =
            document.querySelector('video') || document.querySelector('#movie_player video');
          if (video && video.paused) video.play().catch(() => {});
        }).catch(() => {});
        return true;
      }
      return !!skipped;
    } catch (_) {
      return false;
    }
  }

  // ============================================================================
  // BOT REGISTER / LOGIN
  // ----------------------------------------------------------------------------
  // બે રીત છે:
  //
  // 1) OLD (manual) – browser open થાય, user પોતે YouTube/Google login કરે,
  //    પછી cookies save. (નીચે comment માં રાખેલ – reference માટે)
  //
  // 2) NEW (active) – email + password આપો તો auto Google login + cookies save.
  //    CSV bulk પણ આ જ method વાપરે છે.
  //    Email/password ન હોય તો હજુ પણ manual browser login ચાલે છે (fallback).
  // ============================================================================

  /*
  // ========== OLD METHOD (COMMENTED – manual browser login only) ==========
  // Use: registerAndLoginBot(botName)  – no email/password
  // Flow:
  //   1. Launch visible browser (headless=false)
  //   2. Open YouTube / Google login page
  //   3. Wait up to 5 minutes while USER signs in manually
  //   4. When logged in → save cookies to DB → close browser
  //
  // async registerAndLoginBot_OLD_MANUAL(botName) {
  //   console.log(`\n[REGISTER] ${botName} – Playwright persistent profile login\n`);
  //   const { browser, page } = await this._launchWithProfile(botName, { headless: false });
  //   try {
  //     await page.goto('https://www.youtube.com', {
  //       waitUntil: 'domcontentloaded',
  //       timeout: navTimeout()
  //     });
  //     await sleep(2000);
  //     await this._dismissBanners(page);
  //
  //     if (await this._isLoggedIn(page)) {
  //       console.log(`[${botName}] Already logged in via saved profile`);
  //     } else {
  //       await page.goto(
  //         'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F&hl=en',
  //         { waitUntil: 'domcontentloaded', timeout: navTimeout() }
  //       );
  //       console.log('========================================');
  //       console.log(`[${botName}] Browser open – SIGN IN ONCE`);
  //       console.log(`[${botName}] Timeout: 5 minutes`);
  //       console.log('========================================\n');
  //
  //       const maxWait = 300000; // 5 min
  //       const start = Date.now();
  //       let loggedIn = false;
  //       while (Date.now() - start < maxWait) {
  //         const url = page.url();
  //         if (
  //           url.includes('youtube.com') &&
  //           !url.includes('accounts.google') &&
  //           !url.includes('ServiceLogin')
  //         ) {
  //           if (await this._isLoggedIn(page)) {
  //             loggedIn = true;
  //             break;
  //           }
  //         }
  //         await sleep(3000);
  //       }
  //       if (!loggedIn) {
  //         await page.goto('https://www.youtube.com', {
  //           waitUntil: 'domcontentloaded',
  //           timeout: navTimeout()
  //         }).catch(() => {});
  //         await sleep(2000);
  //         if (!(await this._isLoggedIn(page))) {
  //           throw new Error('Login timeout. Complete sign-in in the browser window.');
  //         }
  //       }
  //     }
  //
  //     await sleep(3000);
  //     await page.goto('https://www.youtube.com', {
  //       waitUntil: 'domcontentloaded',
  //       timeout: navTimeout()
  //     }).catch(() => {});
  //     await sleep(2000);
  //
  //     const cookies = normalizeCookies(await this._getCookies(browser));
  //     let bot = await Bot.findOne({ botName });
  //     if (bot) {
  //       bot.cookies = cookies;
  //       bot.updatedAt = new Date();
  //       await bot.save();
  //     } else {
  //       bot = new Bot({ botName, cookies });
  //       await bot.save();
  //     }
  //     console.log(`[${botName}] ✅ Profile + cookies saved.`);
  //     await browser.close().catch(() => {});
  //     return bot;
  //   } catch (err) {
  //     await browser.close().catch(() => {});
  //     throw err;
  //   }
  // }
  // ========== END OLD METHOD ==========
  */

  /**
   * Detect Google interstitial / captcha / challenge pages (password field often missing).
   */
  async _googleLoginPageKind(page) {
    const url = page.url();
    const urlLower = url.toLowerCase();
    const bodyText = await page
      .evaluate(() => (document.body && document.body.innerText) || '')
      .catch(() => '');
    const t = `${urlLower} ${String(bodyText).toLowerCase()}`;

    // Google hard-block
    if (
      urlLower.includes('signin/rejected') ||
      urlLower.includes('/rejected?') ||
      t.includes('this browser or app may not be secure') ||
      t.includes("couldn't sign you in") ||
      t.includes('couldn’t sign you in')
    ) {
      return 'rejected';
    }

    // IMPORTANT: Google password step URL is often:
    //   /v3/signin/challenge/pwd
    // That is NOT 2FA – it IS the password page.
    const hasPassInput = await page
      .locator('input[type="password"], input[name="Passwd"], input[name="password"]')
      .first()
      .isVisible()
      .catch(() => false);

    if (
      hasPassInput ||
      urlLower.includes('/challenge/pwd') ||
      urlLower.includes('challenge/pwd') ||
      urlLower.includes('/pwd?') ||
      urlLower.includes('signin/pwd')
    ) {
      return 'password';
    }

    if (
      t.includes('captcha') ||
      t.includes('recaptcha') ||
      t.includes('unusual traffic') ||
      t.includes('not a robot')
    ) {
      return 'captcha';
    }

    // Real extra verification (exclude /challenge/pwd already handled above)
    if (
      urlLower.includes('/challenge/') ||
      t.includes('2-step') ||
      t.includes('two-step') ||
      t.includes('verify it') ||
      t.includes('phone number') ||
      t.includes('enter the code') ||
      t.includes('account recovery')
    ) {
      return 'challenge';
    }

    if (
      t.includes("couldn't find your google account") ||
      t.includes('couldn’t find your google account')
    ) {
      return 'unknown_account';
    }
    if (t.includes('wrong password') || t.includes('incorrect password')) {
      return 'bad_password';
    }

    const hasEmail = await page
      .locator('input[type="email"], input[name="identifier"]')
      .first()
      .isVisible()
      .catch(() => false);
    if (hasEmail) return 'email';

    return 'other';
  }

  async _clickGoogleNext(page) {
    const selectors = [
      '#identifierNext button',
      '#identifierNext',
      '#passwordNext button',
      '#passwordNext',
      'button:has-text("Next")',
      'button:has-text("Continue")',
      'div[role="button"]:has-text("Next")',
      'div[role="button"]:has-text("Continue")',
    ];
    for (const sel of selectors) {
      try {
        const loc = page.locator(sel).first();
        if (await loc.isVisible({ timeout: 800 }).catch(() => false)) {
          await loc.click({ timeout: 3000 }).catch(() => {});
          return true;
        }
      } catch (_) {}
    }
    await page.keyboard.press('Enter').catch(() => {});
    return false;
  }

  /**
   * NEW: Google login form auto-fill (email + password).
   * Email પછી captcha/challenge આવે તો password field નથી મળતું – એ handle કરે છે.
   * HEADLESS=false હોય તો challenge manual complete કરી શકો (BOT_LOGIN_WAIT_MS).
   */
  async _autoGoogleLogin(page, botName, email, password) {
    console.log(`[${botName}] Auto login → ${email}`);
    const stepWait = parseInt(process.env.BOT_LOGIN_STEP_MS || '45000', 10);

    await page.goto(
      'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F&hl=en',
      { waitUntil: 'domcontentloaded', timeout: navTimeout() }
    );
    await sleep(2000);

    // ----- Step 1: email -----
    try {
      const emailSel = 'input[type="email"], input[name="identifier"]';
      await page.waitForSelector(emailSel, { timeout: 25000, state: 'visible' });
      await page.fill(emailSel, '');
      await page.type(emailSel, email, { delay: 40 });
      await sleep(500);
      await this._clickGoogleNext(page);
      await sleep(2000);
    } catch (e) {
      throw new Error(`Email step failed: ${e.message}`);
    }

    // ----- Step 2: wait for password OR captcha/challenge -----
    const passSel = 'input[type="password"], input[name="Passwd"], input[name="password"]';
    const deadline = Date.now() + stepWait;
    let kind = 'other';

    while (Date.now() < deadline) {
      kind = await this._googleLoginPageKind(page);
      console.log(`[${botName}] Login page kind: ${kind} | url=${page.url().slice(0, 120)}`);

      if (kind === 'password') break;
      if (kind === 'unknown_account') {
        throw new Error(`Google account not found: ${email}`);
      }
      if (kind === 'rejected') {
        throw new Error(
          `Google REJECTED this login (automation/bot detect). Headless CSV login will not work for this account/IP. Use manual register: only botName, browser open → login yourself → cookies save.`
        );
      }
      if (kind === 'captcha' || kind === 'challenge') {
        console.warn(
          `[${botName}] ${kind} after email – waiting for manual solve (set HEADLESS=false). Remaining ${Math.round(
            (deadline - Date.now()) / 1000
          )}s`
        );
      }
      if (kind === 'email') {
        await this._clickGoogleNext(page);
      }
      await sleep(2000);
    }

    if (kind !== 'password') {
      const exists = await page.locator(passSel).count().catch(() => 0);
      if (!exists) {
        throw new Error(
          `Password field not shown (got "${kind}"). Google blocked auto-login (captcha/2FA/bot detect). Use HEADLESS=false and complete manually, or manual register without CSV.`
        );
      }
    }

    // ----- Step 3: password -----
    try {
      await page.waitForSelector(passSel, { timeout: 15000, state: 'visible' });
      await page.fill(passSel, '');
      await page.type(passSel, password, { delay: 35 });
      await sleep(500);
      await this._clickGoogleNext(page);
      await sleep(3000);
    } catch (e) {
      throw new Error(`Password step failed (captcha/2FA?): ${e.message}`);
    }

    // ----- Step 4: wait until YouTube session -----
    const maxWait = parseInt(process.env.BOT_LOGIN_WAIT_MS || '180000', 10);
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const url = page.url();
      kind = await this._googleLoginPageKind(page);

      if (kind === 'bad_password') {
        throw new Error(`Wrong password for ${email}`);
      }

      if (
        url.includes('youtube.com') &&
        !url.includes('accounts.google') &&
        !url.includes('ServiceLogin') &&
        !url.includes('signin/challenge')
      ) {
        await page
          .goto('https://www.youtube.com', {
            waitUntil: 'domcontentloaded',
            timeout: navTimeout(),
          })
          .catch(() => {});
        await sleep(1500);
        if (await this._isLoggedIn(page)) return true;
      }

      if (kind === 'captcha' || kind === 'challenge') {
        console.warn(
          `[${botName}] ${kind} after password – complete in browser if visible (HEADLESS=false)`
        );
      }
      await sleep(2500);
    }
    return false;
  }

  /**
   * Register bot + save cookies.
   * - opts.email + opts.password → auto Google login (CSV / API)
   * - no credentials → MANUAL mode:
   *     1. Browser only opens (blank – no auto YouTube / signup page)
   *     2. User manually opens YouTube → signup / login → browse
   *     3. When user CLOSES the browser → cookies are read from profile & saved
   */
  async registerAndLoginBot(botName, opts = {}) {
    const email = (opts.email || '').trim();
    const password = opts.password || '';
    const auto = !!(email && password);

    // Auto: headless unless BOT_AUTO_LOGIN_HEADLESS=false
    // Manual: always visible
    const headless = auto ? process.env.BOT_AUTO_LOGIN_HEADLESS !== 'false' : false;

    console.log(
      `\n[REGISTER] ${botName} – ${auto ? `auto login (${email})` : 'manual browser (close to save cookies)'}\n`
    );

    // ---------- MANUAL MODE: open blank browser, wait for user close ----------
    if (!auto) {
      return this._registerManualCloseToSave(botName);
    }

    // ---------- AUTO MODE (email + password) – unchanged ----------
    const { browser, page } = await this._launchWithProfile(botName, {
      headless,
      forLogin: true,
    });

    try {
      await page.goto('https://www.youtube.com', {
        waitUntil: 'domcontentloaded',
        timeout: navTimeout(),
      });
      await sleep(1500);
      await this._dismissBanners(page);

      if (await this._isLoggedIn(page)) {
        console.log(`[${botName}] Already logged in via saved profile`);
      } else {
        const ok = await this._autoGoogleLogin(page, botName, email, password);
        if (!ok) {
          await page
            .goto('https://www.youtube.com', {
              waitUntil: 'domcontentloaded',
              timeout: navTimeout(),
            })
            .catch(() => {});
          await sleep(2000);
          if (!(await this._isLoggedIn(page))) {
            throw new Error(
              `Auto login failed for ${email}. Captcha/2FA/rejected? Try BOT_AUTO_LOGIN_HEADLESS=false or manual register.`
            );
          }
        }
      }

      await sleep(2000);
      await page
        .goto('https://www.youtube.com', { waitUntil: 'domcontentloaded', timeout: navTimeout() })
        .catch(() => {});
      await sleep(1500);

      const cookies = normalizeCookies(await this._getCookies(browser));
      if (!hasAuthCookies(cookies)) {
        throw new Error('Login ok but no auth cookies found – try again');
      }

      let bot = await Bot.findOne({ botName });
      if (bot) {
        bot.cookies = cookies;
        bot.updatedAt = new Date();
        await bot.save();
      } else {
        bot = new Bot({ botName, cookies });
        await bot.save();
      }

      console.log(`[${botName}] ✅ Profile + cookies saved (${cookies.length} cookies).`);
      await browser.close().catch(() => {});
      return bot;
    } catch (err) {
      await browser.close().catch(() => {});
      throw err;
    }
  }

  /**
   * MANUAL register flow (user request):
   * - Only open browser (blank / about:blank) – do NOT open YouTube or Google signup
   * - User manually opens YouTube, signs up / logs in, browses
   * - When user closes the browser window → read cookies from persistent profile & save
   */
  async _registerManualCloseToSave(botName) {
    const maxWait = parseInt(process.env.BOT_MANUAL_LOGIN_TIMEOUT_MS || '900000', 10); // default 15 min

    const { browser, page } = await this._launchWithProfile(botName, {
      headless: false,
      forLogin: true,
    });

    try {
      // Blank page only – user will open YouTube themselves
      await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});

      console.log('========================================');
      console.log(`[${botName}] Browser is OPEN (blank).`);
      console.log(`[${botName}] 1. Manually open YouTube (youtube.com)`);
      console.log(`[${botName}] 2. Sign up / Log in yourself`);
      console.log(`[${botName}] 3. Browse / search a little if you want`);
      console.log(`[${botName}] 4. CLOSE this browser window when done`);
      console.log(`[${botName}] → Cookies will be saved automatically on close`);
      console.log(`[${botName}] Timeout: ${Math.round(maxWait / 60000)} minutes`);
      console.log('========================================\n');

      // Wait until user closes the browser (or timeout)
      await new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error(`Manual login timeout (${Math.round(maxWait / 60000)} min). Close browser after signup.`));
        }, maxWait);

        const onClose = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          console.log(`[${botName}] Browser closed by user – reading cookies from profile...`);
          resolve();
        };

        browser.on('close', onClose);
        // Also watch for disconnect (some Playwright versions)
        if (typeof browser.on === 'function') {
          try {
            browser.on('disconnected', onClose);
          } catch (_) {}
        }
      });
    } catch (err) {
      await browser.close().catch(() => {});
      throw err;
    }

    // Context is closed – re-open same persistent profile headless to read cookies
    let cookies = [];
    try {
      const { browser: browser2 } = await this._launchWithProfile(botName, {
        headless: true,
        forLogin: true,
      });
      try {
        cookies = normalizeCookies(await this._getCookies(browser2));
      } finally {
        await browser2.close().catch(() => {});
      }
    } catch (e) {
      console.error(`[${botName}] Failed to re-open profile for cookies:`, e.message);
      throw new Error('Browser closed but could not read cookies from profile. Try again.');
    }

    if (!hasAuthCookies(cookies)) {
      throw new Error(
        'No YouTube auth cookies found after browser close. Did you complete signup/login on YouTube before closing?'
      );
    }

    let bot = await Bot.findOne({ botName });
    if (bot) {
      bot.cookies = cookies;
      bot.updatedAt = new Date();
      await bot.save();
    } else {
      bot = new Bot({ botName, cookies });
      await bot.save();
    }

    console.log(`[${botName}] ✅ Manual register done – cookies saved (${cookies.length} cookies).`);
    return bot;
  }

  async registerBotsFromCsv(csvText) {
    const lines = String(csvText || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));

    const results = { ok: [], failed: [] };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip CSV header
      if (i === 0 && /email/i.test(line) && /pass/i.test(line)) continue;

      // comma or tab separated
      const parts = line.includes('\t') ? line.split('\t') : line.split(',');
      const email = (parts[0] || '').trim().replace(/^"|"$/g, '');
      const password = (parts[1] || '').trim().replace(/^"|"$/g, '');
      let botName = (parts[2] || '').trim().replace(/^"|"$/g, '');

      if (!email || !password) {
        results.failed.push({ line: i + 1, email, error: 'email/password missing' });
        continue;
      }

      // Default bot name from email prefix
      if (!botName) {
        botName = email
          .split('@')[0]
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .slice(0, 40);
        if (botName.length < 2) botName = `bot_${i + 1}`;
      }

      // Ensure unique botName in DB
      let finalName = botName;
      let n = 1;
      while (await Bot.findOne({ botName: finalName })) {
        finalName = `${botName}_${n++}`;
      }

      try {
        console.log(`[CSV] (${i + 1}/${lines.length}) Registering ${finalName} <${email}>...`);
        const bot = await this.registerAndLoginBot(finalName, { email, password });
        results.ok.push({
          botName: bot.botName,
          email,
          cookieCount: (bot.cookies || []).length,
        });
      } catch (err) {
        console.error(`[CSV] Failed ${email}:`, err.message);
        results.failed.push({ line: i + 1, email, botName: finalName, error: err.message });
      }

      // Gap between accounts (rate-limit / less detection)
      await sleep(2000);
    }

    return results;
  }

  /**
   * Re-login existing bot (manual browser – same as old refresh).
   * Email/password CSV refresh અલગથી register-csv વાપરો.
   */
  async refreshBotLogin(botName) {
    const existing = await Bot.findOne({ botName });
    if (!existing) throw new Error(`Bot "${botName}" not found`);
    // No credentials → manual login fallback inside registerAndLoginBot
    return this.registerAndLoginBot(botName);
  }


  /**
   * BULK-FRIENDLY: Register bot from cookies only (NO Google login).
   * Google auto-login block થાય ત્યારે આ જ practical solution – seconds માં 100 bots.
   *
   * cookies: EditThisCookie / Cookie-Editor / Playwright JSON array
   */
  async importBotFromCookies(botName, cookiesRaw) {
    const name = String(botName || '').trim();
    if (name.length < 2) throw new Error('botName min 2 chars');

    let list = cookiesRaw;
    if (typeof list === 'string') {
      list = JSON.parse(list);
    }
    if (!Array.isArray(list) || !list.length) {
      throw new Error('cookies must be a non-empty JSON array');
    }

    const cookies = normalizeCookies(list);
    if (!hasAuthCookies(cookies)) {
      throw new Error(
        'No YouTube auth cookies found (need SID / SAPISID / __Secure-1PSID / LOGIN_INFO). Export cookies while logged into YouTube.'
      );
    }

    let bot = await Bot.findOne({ botName: name });
    if (bot) {
      bot.cookies = cookies;
      bot.updatedAt = new Date();
      await bot.save();
    } else {
      bot = new Bot({ botName: name, cookies });
      await bot.save();
    }
    console.log(`[IMPORT] ${name} ← ${cookies.length} cookies saved`);
    return bot;
  }

  /**
   * Bulk import bots from cookies (no browser, no Google login).
   *
   * Accepts:
   *  A) [ { "botName": "bot-1", "cookies": [ ... ] }, ... ]
   *  B) { "bot-1": [ ...cookies ], "bot-2": [ ...cookies ] }
   *  C) JSONL text – one JSON object per line
   */
  async importBotsFromCookiesBulk(payload) {
    let items = [];

    if (typeof payload === 'string') {
      const text = payload.trim();
      try {
        payload = JSON.parse(text);
      } catch {
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        for (let i = 0; i < lines.length; i++) {
          try {
            items.push(JSON.parse(lines[i]));
          } catch {
            items.push({ _error: `line ${i + 1}: invalid JSON` });
          }
        }
        payload = null;
      }
    }

    if (payload && Array.isArray(payload)) {
      items = payload;
    } else if (payload && typeof payload === 'object') {
      if (payload.botName && payload.cookies) {
        items = [payload];
      } else {
        items = Object.entries(payload).map(([botName, cookies]) => ({ botName, cookies }));
      }
    }

    const results = { ok: [], failed: [] };
    for (const row of items) {
      if (row && row._error) {
        results.failed.push({ error: row._error });
        continue;
      }
      const botName = row.botName || row.name || row.id;
      const cookies = row.cookies || row.cookie || row.cookiesJson;
      try {
        if (!botName) throw new Error('botName missing');
        const bot = await this.importBotFromCookies(botName, cookies);
        results.ok.push({
          botName: bot.botName,
          cookieCount: (bot.cookies || []).length,
        });
      } catch (e) {
        results.failed.push({ botName: botName || '?', error: e.message });
      }
    }
    return results;
  }

  async performActionWithBot(videoUrl, botData, options = {}) {
    // viewOnly / watchHours = no like/comment, only extended watch
    const watchHours = !!options.watchHours;
    const viewOnly = !!options.viewOnly || watchHours;
    const doLike = viewOnly ? false : options.doLike !== false;
    const doComment = viewOnly ? false : !!options.doComment;
    // Prefer pre-assigned unique text so each bot posts a different comment
    const commentText = doComment
      ? (options.commentText || pickRandomComment(options.comments))
      : null;

    const modeLabel = watchHours
      ? ' watch-hours (very long watch)'
      : viewOnly
        ? ' view-only (long watch)'
        : ` like=${doLike} comment=${doComment}`;
    console.log(
      `[ACTION] ${botData.botName} →` + modeLabel + (commentText ? ` text="${commentText}"` : '')
    );

    const isHeadless = process.env.HEADLESS !== 'false';
    const { browser, page } = await this._launchWithProfile(botData.botName, {
      headless: isHeadless
    });

    const result = {
      botName: botData.botName,
      success: false,
      liked: false,
      alreadyLiked: false,
      commented: false,
      commentText: commentText || null,
      error: null,
      watchedSeconds: 0
    };

    try {
      await page.goto('https://www.youtube.com', {
        waitUntil: 'domcontentloaded',
        timeout: navTimeout()
      });
      await sleep(2500);
      await this._dismissBanners(page);

      let loggedIn = await this._isLoggedIn(page);

      if (!loggedIn) {
        console.log(`[${botData.botName}] Profile not logged in – trying DB cookies...`);
        const cookies = normalizeCookies(botData.cookies || []);
        const pwCookies = cookies.map((c) => {
          const out = {
            name: c.name,
            value: c.value,
            domain: c.domain || '.youtube.com',
            path: c.path || '/',
            httpOnly: !!c.httpOnly,
            secure: c.secure !== false
          };
          if (c.expires) out.expires = c.expires;
          if (c.sameSite) out.sameSite = c.sameSite;
          return out;
        });
        try {
          await browser.addCookies(pwCookies);
        } catch (e) {
          console.warn(`[${botData.botName}] addCookies partial fail:`, e.message);
        }
        await page.goto('https://www.youtube.com', {
          waitUntil: 'domcontentloaded',
          timeout: navTimeout()
        });
        await sleep(2500);
        await this._dismissBanners(page);
        loggedIn = await this._isLoggedIn(page);
      }

      if (!loggedIn) {
        throw new Error(
          'Session expired. Run ONE time: POST /api/bot/refresh/' + botData.botName
        );
      }
      console.log(`[${botData.botName}] ✅ Logged in`);

      await page.goto(videoUrl, { waitUntil: 'domcontentloaded', timeout: navTimeout() });

      // Natural wait after page load (2–4 seconds) before interacting
      const postLoadWait = 2000 + Math.floor(Math.random() * 2001); // 2–4 s
      await sleep(postLoadWait);
      await this._dismissBanners(page);
      await this._skipAdsIfPresent(page, botData.botName);

      if (!(await this._isLoggedIn(page))) {
        throw new Error('Logged out on video page. Run /refresh/' + botData.botName);
      }

      await page
        .waitForSelector('video, ytd-player, #movie_player', { timeout: actionTimeout() })
        .catch(() => {});

      // Human-like: random scroll + smooth mouse move toward play button, then start video
      await this._humanStartVideo(page, botData.botName);
      await this._skipAdsIfPresent(page, botData.botName);

      // Views / Watch-hours: longer watch; likes/comments: WATCH_TIME_*
      const watchSec = await this._watchVideo(page, botData.botName, {
        viewOnly: !!options.viewOnly,
        watchHours,
      });
      result.watchedSeconds = watchSec;
      if (watchHours) result.watchHours = true;
      else if (options.viewOnly) result.viewed = true;

      if (doLike) {
        // Human-like pause + scroll before like (reduces instant like→close pattern)
        await this._humanPrepBeforeLike(page, botData.botName);
        const likeResult = await this._clickLike(page, botData.botName);
        result.liked = !!likeResult.success && !likeResult.alreadyLiked;
        result.alreadyLiked = !!likeResult.alreadyLiked;
        // alreadyLiked counts as success for this bot (no need to retry as failure)
        if (!likeResult.success && !likeResult.alreadyLiked) {
          throw new Error(likeResult.error || 'Like failed');
        }
        // Stay on page after like (default 8–15s) so session looks less bot-like
        const afterMin = parseInt(process.env.AFTER_LIKE_MIN || '8', 10);
        const afterMax = parseInt(process.env.AFTER_LIKE_MAX || '15', 10);
        const afterSec =
          Math.min(afterMin, afterMax) +
          Math.floor(Math.random() * (Math.abs(afterMax - afterMin) + 1));
        await this._continueWatch(page, botData.botName, afterSec);
      }

      if (doComment && commentText) {
        await this._postComment(page, botData.botName, commentText);
        result.commented = true;
      }

      // success = no throw; for like orders, liked OR alreadyLiked required above
      result.success = true;
    } catch (err) {
      result.error = err.message;
      result.success = false;
      console.error(`[${botData.botName}] ❌`, err.message);
    }

    try {
      const updated = normalizeCookies(await this._getCookies(browser));
      if (updated.length) {
        await Bot.findOneAndUpdate(
          { _id: botData._id },
          { cookies: updated, updatedAt: new Date() }
        );
        console.log(`[${botData.botName}] Cookies backed up (${updated.length})`);
      }
    } catch (e) {
      console.error(`[${botData.botName}] Cookie backup failed:`, e.message);
    }

    await browser.close().catch(() => {});
    return result;
  }

  async performLikeWithBot(videoUrl, botData) {
    return this.performActionWithBot(videoUrl, botData, { doLike: true, doComment: false });
  }

  async _watchVideo(page, botName, opts = {}) {
    // VIEW / WATCH-HOURS: visible player in viewport – required for YouTube to count views.
    // LIKE / COMMENT: can mute + lower quality to save CPU (not used for view counting).
    //
    // Durations:
    //   Views: VIEW_WATCH_TIME_MIN/MAX (default 60–180s) – prefer >=30s real play
    //   Watch hours: 80–90% of video length
    //   Likes/comments: WATCH_TIME_MIN/MAX (default 120–240s)
    const watchHours = !!opts.watchHours;
    const viewOnly = !!opts.viewOnly;
    const countAsView = viewOnly || watchHours;
    let sec;
    let modeTag = '';

    // ---- Start playback (VISIBLE for views) ----
    try {
      await page.evaluate(async (asView) => {
        const video =
          document.querySelector('video') || document.querySelector('#movie_player video');
        if (!video) return;

        const player = document.querySelector('#movie_player');

        if (asView) {
          // Real view: keep player visible in normal layout
          video.muted = false;
          try {
            video.volume = 0.15 + Math.random() * 0.25; // low but not silent
          } catch (_) {}
          video.style.opacity = '';
          video.style.pointerEvents = '';
          video.style.position = '';
          video.style.left = '';
          try {
            if (player) {
              player.style.opacity = '';
              player.scrollIntoView({ block: 'center', behavior: 'instant' });
            }
          } catch (_) {}
          // Prefer small but real quality (not "tiny" which often does not count)
          try {
            if (player && player.setPlaybackQualityRange) {
              player.setPlaybackQualityRange('small', 'medium');
            }
            if (player && player.setPlaybackQuality) {
              player.setPlaybackQuality('small');
            }
          } catch (_) {}
        } else {
          // Likes/comments only – save resources
          video.muted = true;
          try {
            if (player && player.setPlaybackQualityRange) {
              player.setPlaybackQualityRange('tiny', 'small');
            }
            if (player && player.setPlaybackQuality) {
              player.setPlaybackQuality('tiny');
            }
          } catch (_) {}
        }

        try {
          await video.play();
        } catch (_) {
          if (player) player.click();
          else video.click();
        }
      }, countAsView);
    } catch (_) {}

    // Confirm actually playing (views)
    if (countAsView) {
      try {
        await page.waitForFunction(
          () => {
            const v =
              document.querySelector('video') ||
              document.querySelector('#movie_player video');
            return v && !v.paused && v.readyState >= 2;
          },
          { timeout: 15000 }
        );
      } catch (_) {
        // retry play
        await page.evaluate(() => {
          const v =
            document.querySelector('video') ||
            document.querySelector('#movie_player video');
          const p = document.querySelector('#movie_player');
          if (v) {
            v.muted = false;
            v.play().catch(() => {});
          }
          if (p) p.click();
        }).catch(() => {});
        await sleep(1500);
      }
    }

    // First ad check right after play starts
    try {
      await this._skipAdsIfPresent(page, botName);
    } catch (_) {}

    // ---- Duration ----
    if (watchHours) {
      let videoDuration = 0;
      for (let i = 0; i < 15; i++) {
        try {
          videoDuration = await page.evaluate(() => {
            const video =
              document.querySelector('video') || document.querySelector('#movie_player video');
            if (!video) return 0;
            const d = video.duration;
            return d && isFinite(d) && d > 0 ? d : 0;
          });
        } catch (_) {
          videoDuration = 0;
        }
        if (videoDuration >= 10) break;
        await sleep(800);
      }

      // Prefer near-full watch for watch-hours (user wants "puro time")
      const pctMin = Math.min(
        99,
        Math.max(70, parseInt(process.env.WATCH_HOUR_PCT_MIN || '90', 10))
      );
      const pctMax = Math.min(
        100,
        Math.max(pctMin, parseInt(process.env.WATCH_HOUR_PCT_MAX || '98', 10))
      );
      const pct = pctMin + Math.random() * (pctMax - pctMin);

      if (videoDuration >= 10) {
        sec = Math.max(30, Math.floor((videoDuration * pct) / 100));
        const cap = parseInt(process.env.WATCH_HOUR_TIME_MAX || '0', 10);
        if (cap > 0 && sec > cap) sec = cap;
        modeTag = ` [WATCH HOURS – ${pct.toFixed(0)}% of ${Math.round(videoDuration)}s]`;
      } else {
        const minSec = parseInt(process.env.WATCH_HOUR_TIME_MIN || '1800', 10);
        const maxSec = parseInt(process.env.WATCH_HOUR_TIME_MAX || '3600', 10);
        const lo = Math.min(minSec, maxSec);
        const hi = Math.max(minSec, maxSec);
        sec = lo + Math.floor(Math.random() * (hi - lo + 1));
        modeTag = ' [WATCH HOURS – duration unknown]';
      }
    } else if (viewOnly) {
      // Real views need enough continuous play time (YT often needs ~30s+)
      const minSec = parseInt(process.env.VIEW_WATCH_TIME_MIN || '60', 10);
      const maxSec = parseInt(process.env.VIEW_WATCH_TIME_MAX || '180', 10);
      const lo = Math.min(minSec, maxSec);
      const hi = Math.max(minSec, maxSec);
      sec = lo + Math.floor(Math.random() * (hi - lo + 1));
      // Also try % of video if known
      try {
        const dur = await page.evaluate(() => {
          const v =
            document.querySelector('video') || document.querySelector('#movie_player video');
          const d = v && v.duration;
          return d && isFinite(d) && d > 0 ? d : 0;
        });
        if (dur >= 20) {
          // Prefer longer real watch (45–85%) so views look more human / "puro time"
          const pct = 0.45 + Math.random() * 0.40;
          const byPct = Math.floor(dur * pct);
          // use the larger of configured timer vs % so short videos still get enough
          sec = Math.max(sec, Math.min(byPct, Math.floor(dur * 0.95)));
          // hard ceiling from env max
          sec = Math.min(sec, hi);
          sec = Math.max(sec, Math.min(35, Math.floor(dur * 0.55)));
          modeTag = ` [VIEW visible – ~${Math.round((sec / dur) * 100)}% of ${Math.round(dur)}s]`;
        } else {
          modeTag = ' [VIEW visible – timed]';
        }
      } catch (_) {
        modeTag = ' [VIEW visible – timed]';
      }
    } else {
      const minSec = parseInt(process.env.WATCH_TIME_MIN || '120', 10);
      const maxSec = parseInt(process.env.WATCH_TIME_MAX || '240', 10);
      const lo = Math.min(minSec, maxSec);
      const hi = Math.max(minSec, maxSec);
      sec = lo + Math.floor(Math.random() * (hi - lo + 1));
    }

    const mins = (sec / 60).toFixed(1);
    console.log(
      `[${botName}] Watching ${countAsView ? 'VISIBLE' : 'audio-lite'} ${sec}s (~${mins} min)` +
        modeTag +
        ' ...'
    );

    const endAt = Date.now() + sec * 1000;
    let step = 0;
    while (Date.now() < endAt) {
      step++;

      // Skip ads as soon as skip button appears (so main video gets real watch time)
      try {
        await this._skipAdsIfPresent(page, botName);
      } catch (_) {}

      // Human-like mouse movement over the player
      try {
        const box = await page.evaluate(() => {
          const v =
            document.querySelector('#movie_player') ||
            document.querySelector('video') ||
            document.body;
          const r = v.getBoundingClientRect();
          return {
            x: r.left,
            y: r.top,
            w: Math.max(r.width, 200),
            h: Math.max(r.height, 200),
          };
        });
        const x = box.x + Math.random() * box.w;
        const y = box.y + Math.random() * box.h;
        await page.mouse.move(x, y, { steps: 8 + Math.floor(Math.random() * 14) });
      } catch (_) {}

      // Continuous human-like scrolling (smooth, random direction & amount)
      try {
        if (countAsView) {
          // Keep player mostly in view, but still do natural small scrolls
          if (step % 3 === 0) {
            await page.evaluate(() => {
              const p =
                document.querySelector('#movie_player') ||
                document.querySelector('ytd-player');
              if (p) p.scrollIntoView({ block: 'center', behavior: 'smooth' });
            });
          } else if (step % 2 === 0) {
            const dir = Math.random() > 0.35 ? 1 : -1;
            const amount = 30 + Math.floor(Math.random() * 90);
            await page.evaluate(
              ({ d, a }) => window.scrollBy({ top: d * a, left: 0, behavior: 'smooth' }),
              { d: dir, a: amount }
            );
          }
        } else {
          // Like/comment mode: more free scrolling
          if (step % 2 === 0) {
            const dir = Math.random() > 0.3 ? 1 : -1;
            const amount = 80 + Math.floor(Math.random() * 260);
            await page.evaluate(
              ({ d, a }) => window.scrollBy({ top: d * a, left: 0, behavior: 'smooth' }),
              { d: dir, a: amount }
            );
          }
        }
      } catch (_) {}

      // Keep playing + ensure still visible/unmuted for views
      try {
        await page.evaluate((asView) => {
          const video =
            document.querySelector('video') || document.querySelector('#movie_player video');
          if (!video) return;
          if (asView) {
            video.muted = false;
            if (video.style.opacity === '0' || video.style.left === '-9999px') {
              video.style.opacity = '';
              video.style.left = '';
              video.style.position = '';
              video.style.pointerEvents = '';
            }
          }
          if (video.paused) video.play().catch(() => {});
        }, countAsView);
      } catch (_) {}

      const left = endAt - Date.now();
      if (left <= 0) break;
      // Slightly shorter intervals so ad checks + scroll feel continuous
      await sleep(Math.min(900 + Math.floor(Math.random() * 700), left));
    }

    console.log(
      `[${botName}] Watch done (${sec}s, ${countAsView ? 'VISIBLE view' : 'lite'}, steps=${step})`
    );
    return sec;
  }

  /**
   * Before like: scroll description/actions, random mouse, short pause.
   * Makes “watch → instant like → close” less obvious.
   */
  /**
   * Human-like video start: light random scroll + smooth mouse movement toward the
   * player / play button, then click / play. Reduces instant "bot play" pattern.
   */
  async _humanStartVideo(page, botName) {
    console.log(`[${botName}] Human start video (scroll + mouse → play)...`);

    // 1) Small random scrolls (looks around the page – more human-like)
    try {
      await page.evaluate(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        // First look a bit down
        window.scrollBy({ top: 60 + Math.random() * 160, left: 0, behavior: 'smooth' });
        await sleep(280 + Math.random() * 420);
        // Sometimes scroll further or reverse
        if (Math.random() > 0.35) {
          const dir = Math.random() > 0.4 ? 1 : -1;
          window.scrollBy({
            top: dir * (50 + Math.random() * 140),
            left: 0,
            behavior: 'smooth',
          });
          await sleep(250 + Math.random() * 400);
        }
        // Bring player back into view
        const player =
          document.querySelector('#movie_player') ||
          document.querySelector('ytd-player') ||
          document.querySelector('video');
        if (player) player.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
      await sleep(350 + Math.floor(Math.random() * 450));
      // Clear any early ad
      await this._skipAdsIfPresent(page, botName).catch(() => {});
    } catch (_) {}

    // 2) Smooth mouse movement toward the player / big play button
    try {
      const box = await page.evaluate(() => {
        const el =
          document.querySelector('.ytp-large-play-button') ||
          document.querySelector('#movie_player') ||
          document.querySelector('ytd-player') ||
          document.querySelector('video') ||
          document.body;
        const r = el.getBoundingClientRect();
        return {
          x: r.left,
          y: r.top,
          w: Math.max(r.width, 120),
          h: Math.max(r.height, 80),
        };
      });

      // Move from a random edge toward center of player in a few curved steps
      const startX = Math.random() * 80;
      const startY = 100 + Math.random() * 200;
      await page.mouse.move(startX, startY, { steps: 3 });
      await sleep(80 + Math.floor(Math.random() * 120));

      const targetX = box.x + box.w * (0.35 + Math.random() * 0.3);
      const targetY = box.y + box.h * (0.35 + Math.random() * 0.3);
      const steps = 12 + Math.floor(Math.random() * 18); // smooth path
      await page.mouse.move(targetX, targetY, { steps });
      await sleep(150 + Math.floor(Math.random() * 250));
    } catch (_) {}

    // 3) Click play button if present, else fall back to video.play()
    try {
      const playBtn = page.locator(
        '.ytp-large-play-button, button.ytp-play-button, .ytp-play-button'
      ).first();
      if (await playBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await playBtn.click({ timeout: 3000 }).catch(() => {});
        console.log(`[${botName}] Clicked play button`);
      } else {
        await page.evaluate(() => {
          const video =
            document.querySelector('video') ||
            document.querySelector('#movie_player video');
          if (video) {
            // Do not force mute here – view counting needs audible/visible play
            // (mute only if autoplay policy blocks; browser may mute briefly)
            try { video.muted = false; video.volume = 0.2; } catch (_) {}
            video.play().catch(() => {
              video.muted = true;
              video.play().catch(() => {});
            });
          }
          const player = document.querySelector('#movie_player');
          if (player) player.click();
        });
      }
    } catch (_) {
      // last resort already handled inside _watchVideo
    }

    await sleep(300 + Math.floor(Math.random() * 500));
  }

  async _humanPrepBeforeLike(page, botName) {
    const pauseMin = parseInt(process.env.PRE_LIKE_PAUSE_MIN || '2', 10);
    const pauseMax = parseInt(process.env.PRE_LIKE_PAUSE_MAX || '6', 10);
    const lo = Math.min(pauseMin, pauseMax);
    const hi = Math.max(pauseMin, pauseMax);
    const pauseSec = lo + Math.floor(Math.random() * (hi - lo + 1));
    console.log(`[${botName}] Pre-like human prep (${pauseSec}s)...`);

    try {
      // Scroll down a bit (description / comments area) then back toward actions
      await page.evaluate(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        window.scrollBy({ top: 180 + Math.random() * 220, left: 0, behavior: 'smooth' });
        await sleep(400 + Math.random() * 400);
        window.scrollBy({ top: 120 + Math.random() * 160, left: 0, behavior: 'smooth' });
        await sleep(300 + Math.random() * 300);
        const actions =
          document.querySelector('#actions') ||
          document.querySelector('ytd-watch-metadata') ||
          document.querySelector('#top-level-buttons-computed');
        if (actions) actions.scrollIntoView({ block: 'center', behavior: 'smooth' });
        else window.scrollBy({ top: -200, left: 0, behavior: 'smooth' });
      });
    } catch (_) {}

    try {
      const box = await page.evaluate(() => {
        const el =
          document.querySelector('#actions') ||
          document.querySelector('ytd-watch-metadata') ||
          document.body;
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, w: Math.max(r.width, 100), h: Math.max(r.height, 40) };
      });
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
        const x = box.x + Math.random() * box.w;
        const y = box.y + Math.random() * box.h;
        await page.mouse.move(x, y, { steps: 4 + Math.floor(Math.random() * 8) });
        await sleep(200 + Math.floor(Math.random() * 400));
      }
    } catch (_) {}

    await sleep(pauseSec * 1000);
  }

  async _continueWatch(page, botName, sec = 3) {
    console.log(`[${botName}] After like – video continues ${sec}s...`);
    try {
      await page.evaluate(() => {
        const video = document.querySelector('video');
        if (video && video.paused) video.play().catch(() => {});
      });
    } catch (_) {}
    // Light scroll during post-like watch
    try {
      if (sec >= 5) {
        await page.evaluate(() => {
          window.scrollBy({ top: 80 + Math.random() * 120, left: 0, behavior: 'smooth' });
        });
      }
    } catch (_) {}
    await sleep(sec * 1000);
    console.log(`[${botName}] Post-like watch done`);
  }

  /**
   * Click YouTube like button (simple reliable selectors – from working build).
   * Returns { success, alreadyLiked, error? }
   */
  async _clickLike(page, botName) {
    // Updated 2025-2026 selectors (YouTube keeps changing UI)
    const selectors = [
      'like-button-view-model button',
      'segmented-like-dislike-button-view-model button[aria-label*="like" i]',
      'ytd-segmented-like-dislike-button-renderer button[aria-label*="like" i]',
      '#segmented-like-button button',
      '#menu .YtLikeButtonViewModelHost button',
      'button[aria-label*="like this video" i]',
      'button[aria-label*="unlike this video" i]',
      '#top-level-buttons-computed button[aria-pressed]',
      'ytd-watch-metadata like-button-view-model button'
    ];

    for (const sel of selectors) {
      try {
        await page.waitForSelector(sel, { timeout: Math.min(actionTimeout(), 15000) });
        const btn = page.locator(sel).first();
        if ((await btn.count()) === 0) continue;

        const isLiked = await btn.evaluate((el) => {
          const label = (el.getAttribute('aria-label') || '').toLowerCase();
          return label.includes('unlike') || el.getAttribute('aria-pressed') === 'true';
        });

        if (isLiked) {
          console.log(`[${botName}] Already liked`);
          return { success: true, alreadyLiked: true };
        }

        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await sleep(700);
        await btn.click({ delay: 60 }).catch(async () => {
          await page.evaluate((s) => {
            const el = document.querySelector(s);
            if (el) el.click();
          }, sel);
        });
        console.log(`[${botName}] ✅ Liked`);
        await sleep(600);
        return { success: true, alreadyLiked: false };
      } catch (_) {}
    }

    // Fallback: pure JS search
    const r = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button')];
      const like = buttons.find((b) => {
        const l = (b.getAttribute('aria-label') || '').toLowerCase();
        return (
          (l.includes('like this video') || l.includes('unlike this video') || l.includes('like')) &&
          !l.includes('dislike')
        );
      });
      if (!like) return null;
      const liked =
        (like.getAttribute('aria-label') || '').toLowerCase().includes('unlike') ||
        like.getAttribute('aria-pressed') === 'true';
      if (!liked) {
        like.scrollIntoView({ block: 'center', behavior: 'smooth' });
        like.click();
        return false;
      }
      return true;
    });

    if (r === null) {
      console.error(`[${botName}] Like button not found`);
      return { success: false, alreadyLiked: false, error: 'Like button not found' };
    }
    if (r === true) {
      console.log(`[${botName}] Already liked`);
      return { success: true, alreadyLiked: true };
    }
    console.log(`[${botName}] ✅ Liked`);
    await sleep(500);
    return { success: true, alreadyLiked: false };
  }


  /**
   * Shorts (/shorts/ID) → watch?v=ID so normal comments section works.
   */
  _toWatchUrl(url) {
    try {
      const u = String(url || '');
      const m = u.match(/\/shorts\/([a-zA-Z0-9_-]{6,})/);
      if (m) return `https://www.youtube.com/watch?v=${m[1]}`;
      return u;
    } catch (_) {
      return url;
    }
  }

  _isShortsUrl(url) {
    return /\/shorts\//i.test(String(url || ''));
  }

  async _postComment(page, botName, text) {
    console.log(`[${botName}] Posting comment...`);

    // Shorts: no classic #comments – open panel or switch to watch page
    const currentUrl = page.url();
    if (this._isShortsUrl(currentUrl)) {
      console.log(`[${botName}] Shorts detected – trying panel / watch page...`);
      let hasBox = false;
      const shortsCommentBtns = [
        'button[aria-label*="View comments" i]',
        'button[aria-label*="comments" i]',
        '#comments-button button',
        'ytd-reel-player-overlay-renderer button[aria-label*="comment" i]',
        'button[aria-label*="Comment" i]'
      ];
      for (const sel of shortsCommentBtns) {
        try {
          const el = page.locator(sel).first();
          if ((await el.count()) > 0) {
            await el.click({ timeout: 3000 }).catch(() => {});
            await sleep(2000);
            if (await page.$('#contenteditable-root, #placeholder-area, #simplebox-placeholder')) {
              hasBox = true;
              break;
            }
          }
        } catch (_) {}
      }
      if (!hasBox) {
        const watchUrl = this._toWatchUrl(currentUrl);
        console.log(`[${botName}] Opening watch page for comments: ${watchUrl}`);
        await page.goto(watchUrl, { waitUntil: 'domcontentloaded', timeout: navTimeout() });
        await sleep(3500);
        await this._dismissBanners(page);
      }
    }

    // 1. Scroll to comments section
    try {
      await page.evaluate(() => {
        const comments = document.querySelector('#comments, ytd-comments, #below');
        if (comments) comments.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      await sleep(1500);
    } catch (_) {}

    for (let i = 0; i < 12; i++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await sleep(600);
      const found = await page.$(
        '#placeholder-area, #simplebox-placeholder, ytd-comment-simplebox-renderer, #contenteditable-root'
      );
      if (found) break;
    }
    await sleep(1000);

    const openSelectors = [
      '#placeholder-area',
      '#simplebox-placeholder',
      'ytd-comment-simplebox-renderer #placeholder-area',
      'ytd-commentbox #placeholder-area',
      '#simple-box #placeholder-area',
      'ytd-comments #simplebox-placeholder'
    ];
    let opened = false;
    for (const sel of openSelectors) {
      try {
        const el = page.locator(sel).first();
        if ((await el.count()) > 0) {
          await el.scrollIntoViewIfNeeded().catch(() => {});
          await el.click({ timeout: 4000 });
          opened = true;
          await sleep(1000);
          break;
        }
      } catch (_) {}
    }
    if (!opened) {
      await page.evaluate(() => {
        const ph =
          document.querySelector('#placeholder-area') ||
          document.querySelector('#simplebox-placeholder') ||
          document.querySelector('ytd-comment-simplebox-renderer');
        if (ph) {
          ph.scrollIntoView({ block: 'center' });
          ph.click();
        }
      });
      await sleep(1000);
    }

    const editableSel = '#contenteditable-root';
    try {
      await page.waitForSelector(editableSel, { timeout: selTimeout(), state: 'visible' });
    } catch (_) {
      await page.evaluate(() => window.scrollBy(0, 800));
      await sleep(1500);
      try {
        await page.waitForSelector(editableSel, { timeout: selTimeout(), state: 'visible' });
      } catch (__) {
        throw new Error(
          'Comment input not found. Shorts/video may have comments disabled, or try HEADLESS=false.'
        );
      }
    }

    await page.click(editableSel, { delay: 40 });
    await sleep(500);

    // Clear existing text
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await sleep(80);
    await page.keyboard.press('Backspace');
    await sleep(200);

    // Full text + emoji – multiple strategies (YouTube contenteditable is picky)
    const safeText = String(text || '').trim() || 'Nice video';

    const readBox = async () =>
      page.evaluate((sel) => (document.querySelector(sel)?.textContent || '').trim(), editableSel);

    // Clear again right before type
    try {
      await page.locator(editableSel).click({ timeout: 5000 });
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await sleep(200);
    } catch (_) {}

    // Strategy A: insertText via evaluate (single arg object)
    await page.evaluate(
      ({ sel, t }) => {
        const node = document.querySelector(sel);
        if (!node) return;
        node.focus();
        // clear
        node.textContent = '';
        const range = document.createRange();
        range.selectNodeContents(node);
        range.collapse(true);
        const selObj = window.getSelection();
        selObj.removeAllRanges();
        selObj.addRange(range);
        document.execCommand('insertText', false, t);
        node.dispatchEvent(new InputEvent('input', { bubbles: true, data: t, inputType: 'insertText' }));
        node.dispatchEvent(new Event('change', { bubbles: true }));
      },
      { sel: editableSel, t: safeText }
    );
    await sleep(600);

    let typedValue = await readBox();

    // Strategy B: clipboard paste (great for emoji)
    if (!typedValue) {
      try {
        await page.locator(editableSel).click({ timeout: 3000 });
        await page.evaluate(async (t) => {
          try {
            await navigator.clipboard.writeText(t);
          } catch (_) {}
        }, safeText);
        // Ctrl+V
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyV');
        await page.keyboard.up('Control');
        await sleep(500);
        // If clipboard blocked, insert via InputEvent dataTransfer-style
        typedValue = await readBox();
        if (!typedValue) {
          await page.evaluate(
            ({ sel, t }) => {
              const node = document.querySelector(sel);
              if (!node) return;
              node.focus();
              node.innerText = t;
              node.dispatchEvent(new InputEvent('input', { bubbles: true, data: t, inputType: 'insertText' }));
            },
            { sel: editableSel, t: safeText }
          );
          await sleep(400);
          typedValue = await readBox();
        }
      } catch (_) {}
    }

    // Strategy C: keyboard.type character by character
    if (!typedValue) {
      try {
        await page.locator(editableSel).click({ timeout: 3000 });
        await page.keyboard.type(safeText, { delay: 40 });
        await sleep(500);
        typedValue = await readBox();
      } catch (_) {}
    }

    // Strategy D: locator.fill
    if (!typedValue) {
      try {
        await page.locator(editableSel).fill(safeText);
        await sleep(400);
        typedValue = await readBox();
      } catch (_) {}
    }

    if (!typedValue) {
      throw new Error('Failed to type comment text into box');
    }
    console.log(`[${botName}] Typed: "${typedValue}"`);

    // Trigger input events so Submit button enables
    await page.evaluate(() => {
      const root = document.querySelector('#contenteditable-root');
      if (root) {
        root.dispatchEvent(new Event('input', { bubbles: true }));
        root.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await sleep(800);

    let submitted = false;
    for (let trySubmit = 0; trySubmit < 6 && !submitted; trySubmit++) {
      const submitSels = [
        '#submit-button button:not([disabled])',
        'ytd-commentbox #submit-button button',
        'button#submit-button',
        '#submit-button',
        'ytd-commentbox #submit-button',
        'tp-yt-paper-button#submit-button'
      ];
      for (const s of submitSels) {
        try {
          const btn = page.locator(s).first();
          if ((await btn.count()) === 0) continue;
          const disabled = await btn.evaluate((el) => {
            return (
              el.disabled ||
              el.getAttribute('aria-disabled') === 'true' ||
              el.classList.contains('disabled') ||
              el.getAttribute('aria-disabled') === 'true'
            );
          });
          if (disabled) continue;
          await btn.scrollIntoViewIfNeeded().catch(() => {});
          await btn.click({ delay: 50 });
          submitted = true;
          console.log(`[${botName}] Clicked submit button`);
          break;
        } catch (_) {}
      }
      if (!submitted) {
        // Fallback JS click by text
        await page.evaluate(() => {
          const buttons = [...document.querySelectorAll('button, tp-yt-paper-button')];
          const sub = buttons.find((b) => {
            const t = (b.textContent || '').trim().toLowerCase();
            return (t === 'comment' || t === 'reply') && !b.disabled;
          });
          if (sub) sub.click();
        });
        await sleep(900);
        const still = await page.evaluate(
          (sel) => (document.querySelector(sel)?.textContent || '').trim(),
          editableSel
        );
        if (!still || still.length < 2) submitted = true;
      }
      if (!submitted) await sleep(600);
    }

    await sleep(3000);
    if (!submitted) {
      throw new Error(
        'Comment did not post. Try HEADLESS=false to debug, or comments may be held for review / login issue.'
      );
    }

    // Try sort "Newest" so our comment can show (Top may hide new ones)
    try {
      await page.evaluate(() => {
        const sortBtn = [...document.querySelectorAll('button, yt-sort-filter-sub-menu-renderer button')].find(
          (b) => /sort by/i.test(b.getAttribute('aria-label') || '') || /sort by/i.test(b.textContent || '')
        );
        if (sortBtn) sortBtn.click();
      });
      await sleep(800);
      await page.evaluate(() => {
        const newest = [...document.querySelectorAll('tp-yt-paper-listbox a, #menu a, yt-dropdown-menu a, tp-yt-paper-item')].find(
          (a) => /newest/i.test(a.textContent || '')
        );
        if (newest) newest.click();
      });
      await sleep(1500);
    } catch (_) {}

    const safeCheck = String(text)
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
      .replace(/[\u{2600}-\u{27BF}]/gu, '')
      .trim()
      .slice(0, 30)
      .toLowerCase();
    const seen = await page.evaluate((needle) => {
      if (!needle) return false;
      const nodes = document.querySelectorAll(
        '#content-text, yt-formatted-string#content-text, ytd-comment-thread-renderer #content-text'
      );
      for (const n of nodes) {
        if ((n.textContent || '').toLowerCase().includes(needle)) return true;
      }
      return false;
    }, safeCheck);

    if (seen) {
      console.log(`[${botName}] ✅ Comment submitted and visible on page`);
    } else {
      console.log(
        `[${botName}] ✅ Comment submitted (may need "Newest" sort / YouTube review hold – not always visible instantly)`
      );
    }
  }

  /**
   * Shuffle array in place (Fisher–Yates)
   */
  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Extract YouTube video id from watch / shorts / youtu.be URL.
   */
  _extractVideoId(url) {
    try {
      const u = String(url || '');
      let m = u.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
      if (m) return m[1];
      m = u.match(/\/shorts\/([a-zA-Z0-9_-]{6,})/);
      if (m) return m[1];
      m = u.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
      if (m) return m[1];
      return null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Mark video as liked by this bot.
   * One BotLike doc per videoId – botNames / bots list grows on each new like.
   * 2 bots like → list length 2; 3rd like → list length 3.
   */
  async _markBotLikedVideo(bot, videoId) {
    if (!bot || !videoId) return;
    try {
      const botId = bot._id;
      const botName = bot.botName || '';

      // 1) Ensure one doc exists for this videoId
      await BotLike.updateOne(
        { videoId },
        {
          $setOnInsert: {
            videoId,
            botNames: [],
            bots: [],
            createdAt: new Date(),
          },
          $set: { updatedAt: new Date() },
        },
        { upsert: true }
      );

      // 2) Append bot only if not already in list (no duplicates)
      await BotLike.updateOne(
        { videoId, 'bots.botId': { $ne: botId } },
        {
          $addToSet: { botNames: botName },
          $push: {
            bots: {
              botId,
              botName,
              likedAt: new Date(),
            },
          },
          $set: { updatedAt: new Date() },
        }
      );

      console.log(`[${bot.botName}] Saved like on video ${videoId} (list append)`);
    } catch (e) {
      console.warn(`[${bot.botName}] Failed to save BotLike:`, e.message);
    }
  }


  /**
   * Set of botId strings that already liked this videoId.
   * Reads from the single per-video document (bots[].botId).
   */
  async _getBotIdsWhoLikedVideo(videoId) {
    if (!videoId) return new Set();
    const doc = await BotLike.findOne({ videoId }).select('bots.botId botNames').lean();
    if (!doc) return new Set();
    const fromBots = (doc.bots || []).map((b) => String(b.botId)).filter(Boolean);
    return new Set(fromBots);
  }


  /**
   * Pick up to `count` random bots.
   * For likes: prefer bots that have NOT already liked this videoId (BotLike table).
   */
  async _pickRandomBots(count, { excludeLikedVideoId = null } = {}) {
    const all = await Bot.find();
    if (!all.length) throw new Error('No bots in DB. Register one first.');

    let eligible = all;
    if (excludeLikedVideoId) {
      const likedSet = await this._getBotIdsWhoLikedVideo(excludeLikedVideoId);
      eligible = all.filter((b) => !likedSet.has(String(b._id)));
      console.log(
        `[PICK] video=${excludeLikedVideoId} | total bots=${all.length} | not-yet-liked=${eligible.length} | need=${count}`
      );
      if (eligible.length < count) {
        console.warn(
          `[PICK] Only ${eligible.length} bots never liked this video (need ${count}). Will use remaining + runtime replace.`
        );
        const usedIds = new Set(eligible.map((b) => String(b._id)));
        const rest = all.filter((b) => !usedIds.has(String(b._id)));
        this._shuffle(eligible);
        this._shuffle(rest);
        eligible = [...eligible, ...rest];
      }
    }

    this._shuffle(eligible);
    const n = Math.min(count, eligible.length);
    return eligible.slice(0, n);
  }

  async processActions(videoUrl, opts = {}) {
    const doLike = opts.doLike !== false;
    const doComment = !!opts.doComment;
    const comments = opts.comments;
    const videoId = this._extractVideoId(videoUrl);

    let pool = [];
    if (opts.botName) {
      const bot = await Bot.findOne({ botName: opts.botName });
      if (!bot) throw new Error(`Bot "${opts.botName}" not found`);
      pool = [bot];
    } else {
      const count = opts.botCount || 1;
      // For likes: skip bots that already liked this video (from previous orders)
      pool = await this._pickRandomBots(count, {
        excludeLikedVideoId: doLike && videoId ? videoId : null,
      });
    }

    // One unique comment per bot (no same text on every post)
    // Smart: if no custom comments list, generate from video title/theme
    let uniqueComments = [];
    if (doComment) {
      const hasCustom =
        Array.isArray(comments) &&
        comments.some((c) => typeof c === 'string' && c.trim());
      if (hasCustom) {
        uniqueComments = pickUniqueComments(comments, pool.length + 20);
        console.log(`[SmartComment] Using ${uniqueComments.length} custom comments from order`);
      } else {
        try {
          const smart = await generateCommentsForVideo(videoUrl, pool.length + 10);
          uniqueComments = smart.comments || [];
          console.log(
            `[SmartComment] Generated ${uniqueComments.length} comments | theme=${smart.theme} source=${smart.source} title="${(smart.title || '').slice(0, 50)}"`
          );
        } catch (e) {
          console.warn('[SmartComment] Failed, fallback to defaults:', e.message);
          uniqueComments = pickUniqueComments(null, pool.length + 20);
        }
      }
    }
    let commentIdx = 0;
    const nextComment = () =>
      doComment ? uniqueComments[commentIdx++] || pickRandomComment(comments) : null;

    const concurrency = getBotConcurrency(pool.length);
    console.log(
      `[PROCESS] target=${pool.length} bot(s) | concurrency=${concurrency} | like=${doLike} comment=${doComment} | videoId=${videoId || '-'} | names=${pool.map((b) => b.botName).join(',')}`
    );

    const used = new Set();

    // Extra bots for replacement (not in pool, prefer never-liked this video)
    let extraPool = [];
    let likedSet = new Set();
    if (!opts.botName) {
      const all = await Bot.find();
      this._shuffle(all);
      const poolIds = new Set(pool.map((p) => String(p._id)));
      let candidates = all.filter((b) => !poolIds.has(String(b._id)));
      if (doLike && videoId) {
        likedSet = await this._getBotIdsWhoLikedVideo(videoId);
        const fresh = candidates.filter((b) => !likedSet.has(String(b._id)));
        const old = candidates.filter((b) => likedSet.has(String(b._id)));
        this._shuffle(fresh);
        this._shuffle(old);
        extraPool = [...fresh, ...old];
      } else {
        extraPool = candidates;
      }
    }

    // Serialize access to extraPool / used when replacing failed / already-liked bots
    let extraLock = Promise.resolve();
    const withExtraLock = (fn) => {
      const run = extraLock.then(fn, fn);
      extraLock = run.catch(() => {});
      return run;
    };

    // Stagger ONLY within the first concurrent wave (e.g. concurrency=3 → index 0,1,2).
    // Later bots already wait naturally until a slot frees (watch/like time), so no extra index*stagger.
    // BOT_STAGGER_MS = base delay between starts in the first wave (default 7000 (~5-10s gaps))
    // BOT_STAGGER_JITTER_MS = random extra 0..jitter (default 3000)
    const staggerBase = Math.max(0, parseInt(process.env.BOT_STAGGER_MS || '7000', 10));
    const staggerJitter = Math.max(0, parseInt(process.env.BOT_STAGGER_JITTER_MS || '3000', 10));

    const results = await runWithConcurrency(pool, concurrency, async (bot, index) => {
      // Only first wave (index < concurrency) gets stagger; rest start when worker free
      if (index < concurrency && (staggerBase > 0 || staggerJitter > 0)) {
        const delay =
          index * staggerBase + Math.floor(Math.random() * (staggerJitter + 1));
        if (delay > 0) {
          console.log(
            `[PROCESS] ${bot.botName} stagger wait ${Math.round(delay / 1000)}s (wave index=${index}/${concurrency})`
          );
          await sleep(delay);
        }
      }

      used.add(String(bot._id));
      let result = await this.performActionWithBot(videoUrl, bot, {
        doLike,
        doComment,
        comments,
        commentText: nextComment(),
      });

      // Persist like in BotLike collection so next order on same video skips this bot
      if (doLike && result && (result.success || result.alreadyLiked) && videoId) {
        await this._markBotLikedVideo(bot, videoId);
        likedSet.add(String(bot._id));
      }

      // Need replacement if: already liked OR failed
      const needsReplace =
        doLike &&
        result &&
        (result.alreadyLiked || result.success === false) &&
        extraPool.length > 0;

      if (needsReplace) {
        result = await withExtraLock(async () => {
          const reason = result.alreadyLiked ? 'already liked' : 'failed';
          console.log(`[PROCESS] ${bot.botName} ${reason} → trying another bot...`);
          let replaced = result;
          while (extraPool.length) {
            const next = extraPool.shift();
            if (!next || used.has(String(next._id))) continue;
            // Skip bots we already know liked this video (BotLike table)
            if (videoId && likedSet.has(String(next._id))) {
              console.log(`[PROCESS] ${next.botName} already liked this video (DB) → skip`);
              continue;
            }
            used.add(String(next._id));
            const r2 = await this.performActionWithBot(videoUrl, next, {
              doLike,
              doComment,
              comments,
              commentText: nextComment(),
            });
            if (r2.alreadyLiked) {
              console.log(`[PROCESS] ${next.botName} also already liked → skip`);
              if (videoId) await this._markBotLikedVideo(next, videoId);
              continue;
            }
            if (r2.success === false) {
              console.log(`[PROCESS] ${next.botName} failed → try next`);
              continue;
            }
            // Success with replacement bot
            if (doLike && videoId) await this._markBotLikedVideo(next, videoId);
            return r2;
          }
          if (replaced.alreadyLiked) {
            replaced.skippedAlreadyLiked = true;
            replaced.success = true;
          }
          return replaced;
        });
      }

      if (typeof opts.onProgress === 'function') {
        try {
          await opts.onProgress(result);
        } catch (e) {
          console.warn('[PROCESS] onProgress error:', e.message);
        }
      }
      return result;
    });

    console.log(
      `[PROCESS] Done ${results.length} bot(s) | success=${results.filter((r) => r && r.success).length}`
    );
    return results;
  }

  /*
   * ========== OLD Views #1 – LOGIN BOTS (registered cookies) – COMMENTED ==========
   *
   * async processViews_OLD_LOGIN(videoUrl, opts = {}) {
   *   let bots = [];
   *   if (opts.botName) {
   *     const bot = await Bot.findOne({ botName: opts.botName });
   *     if (!bot) throw new Error(`Bot "${opts.botName}" not found`);
   *     bots = [bot];
   *   } else {
   *     const count = opts.botCount || 1;
   *     bots = await this._pickRandomBots(count);
   *   }
   *   const concurrency = getBotConcurrency(bots.length);
   *   const staggerBase = Math.max(0, parseInt(process.env.BOT_STAGGER_MS || '7000', 10));
   *   const staggerJitter = Math.max(0, parseInt(process.env.BOT_STAGGER_JITTER_MS || '3000', 10));
   *   const results = await runWithConcurrency(bots, concurrency, async (bot, index) => {
   *     if (index < concurrency && (staggerBase > 0 || staggerJitter > 0)) {
   *       const delay = index * staggerBase + Math.floor(Math.random() * (staggerJitter + 1));
   *       if (delay > 0) await sleep(delay);
   *     }
   *     return this.performActionWithBot(videoUrl, bot, {
   *       viewOnly: true, doLike: false, doComment: false,
   *     });
   *   });
   *   return results;
   * }
   * ========== END OLD Views #1 ==========
   */

  /*
   * ========== OLD Views #2 – ANONYMOUS disposable browser (no persistent profile) – COMMENTED ==========
   * Previous no-login flow: fresh browser each time, rotate chrome/brave/firefox/webkit, direct goto URL.
   * Replaced by Guest Persistent Profile flow below. Do not delete.
   *
   * async processViews_OLD_ANONYMOUS(videoUrl, opts = {}) {
   *   const count = Math.max(1, parseInt(opts.botCount, 10) || 1);
   *   const sessions = Array.from({ length: count }, (_, i) => ({
   *     sessionId: `view-${Date.now()}-${i + 1}`,
   *     index: i,
   *   }));
   *   const concurrency = getBotConcurrency(sessions.length);
   *   const staggerBase = Math.max(0, parseInt(process.env.BOT_STAGGER_MS || '7000', 10));
   *   const staggerJitter = Math.max(0, parseInt(process.env.BOT_STAGGER_JITTER_MS || '3000', 10));
   *   const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
   *   const results = await runWithConcurrency(sessions, concurrency, async (session, index) => {
   *     if (index < concurrency && (staggerBase > 0 || staggerJitter > 0)) {
   *       const delay = index * staggerBase + Math.floor(Math.random() * (staggerJitter + 1));
   *       if (delay > 0) await sleep(delay);
   *     }
   *     const result = await this._performAnonymousView(videoUrl, session);
   *     if (onProgress) await onProgress(result);
   *     return result;
   *   });
   *   return results;
   * }
   *
   * async _launchAnonymousViewBrowser(sessionId, browserKind) {
   *   // firefox / webkit / chromium.launch + newContext (NOT persistent)
   *   // rotate VIEW_BROWSER_KINDS: chrome, chromium, brave, firefox, webkit
   *   // fingerprint via buildFingerprint(sessionId)
   * }
   *
   * async _performAnonymousView(videoUrl, session) {
   *   // launch → page.goto(videoUrl) → _humanStartVideo → _watchVideo(viewOnly)
   *   // browser.close() – no profile saved
   * }
   * ========== END OLD Views #2 ==========
   */

  /**
   * Views (ACTIVE): Guest Persistent Profiles – NO Gmail login.
   *
   * Flow per unit:
   *  1) Pick profile profiles/view_bot_001 … (create if missing)
   *  2) launchPersistentContext – fixed fingerprint per profile name
   *  3) Warm-up (first time): YT home → search keyword → watch random 20–30s
   *  4) Search target video by title → open → human watch
   *  5) Close context – folder + cookies KEPT
   *  6) 48h cooldown: same profile + same videoId not reused
   */
  async processViews(videoUrl, opts = {}) {
    const count = Math.max(1, parseInt(opts.botCount, 10) || 1);
    const videoId = extractYoutubeVideoId(videoUrl);
    const profiles = pickGuestViewProfiles(count, videoId);

    const concurrency = getBotConcurrency(profiles.length);
    const staggerBase = Math.max(0, parseInt(process.env.BOT_STAGGER_MS || '7000', 10));
    const staggerJitter = Math.max(0, parseInt(process.env.BOT_STAGGER_JITTER_MS || '3000', 10));

    console.log(
      `[VIEWS] ${profiles.length} guest profile(s) | concurrency=${concurrency} | no-login | cooldown=${VIEW_COOLDOWN_MS() / 3600000}h | → ${videoUrl}`
    );

    // Resolve title once (search query)
    let videoTitle = opts.videoTitle || null;
    if (!videoTitle) {
      try {
        videoTitle = await this._fetchYoutubeTitle(videoUrl, videoId);
      } catch (e) {
        console.warn('[VIEWS] title fetch failed, will use videoId search:', e.message);
      }
    }
    if (!videoTitle) videoTitle = videoId || 'youtube video';

    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

    const results = await runWithConcurrency(profiles, concurrency, async (profileName, index) => {
      if (index < concurrency && (staggerBase > 0 || staggerJitter > 0)) {
        const delay =
          index * staggerBase + Math.floor(Math.random() * (staggerJitter + 1));
        if (delay > 0) {
          console.log(
            `[VIEWS] ${profileName} stagger wait ${Math.round(delay / 1000)}s (wave ${index}/${concurrency})`
          );
          await sleep(delay);
        }
      }
      const result = await this._performGuestView(videoUrl, {
        profileName,
        videoId,
        videoTitle,
      });
      if (onProgress) {
        try {
          await onProgress(result);
        } catch (e) {
          console.warn('[VIEWS] onProgress error:', e.message);
        }
      }
      return result;
    });

    console.log(
      `[VIEWS] Done ${results.length} | success=${results.filter((r) => r && r.success).length}`
    );
    return results;
  }

  async _fetchYoutubeTitle(videoUrl, videoId) {
    // oEmbed – no API key
    const id = videoId || extractYoutubeVideoId(videoUrl);
    const oembed = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`;
    try {
      const axios = require('axios');
      const { data } = await axios.get(oembed, { timeout: 10000 });
      if (data && data.title) return String(data.title).trim();
    } catch (_) {}
    return id || null;
  }

  /**
   * Upsert ViewBot document – separate collection from Bot (likes/comments).
   * Saves fingerprint + cookies to MongoDB.
   */
  async _upsertViewBotDb(profileName, patch = {}) {
    try {
      const update = {
        ...patch,
        profileName,
        updatedAt: new Date(),
      };
      if (Array.isArray(patch.cookies)) {
        update.cookieCount = patch.cookies.length;
      }
      const doc = await ViewBot.findOneAndUpdate(
        { profileName },
        { $set: update, $setOnInsert: { createdAt: new Date() } },
        { upsert: true, new: true }
      );
      return doc;
    } catch (e) {
      console.warn(`[VIEWS] ViewBot DB upsert fail ${profileName}:`, e.message);
      return null;
    }
  }

  async _saveViewBotCookiesFromContext(context, profileName, extra = {}) {
    try {
      const raw = (await context.cookies()) || [];
      const cookies = normalizeCookies(raw);
      await this._upsertViewBotDb(profileName, {
        cookies,
        cookieCount: cookies.length,
        ...extra,
      });
      console.log(`[VIEWS] ${profileName} DB saved ${cookies.length} cookies + meta`);
      return cookies;
    } catch (e) {
      console.warn(`[VIEWS] ${profileName} cookie DB save fail:`, e.message);
      return [];
    }
  }

  /**
   * launchPersistentContext for guest view profile.
   * Profile folder NEVER deleted after run.
   *
   * CHANGE (2026-11):
   *  - Load saved fingerprint + browserBrand from ViewBot DB when present → reuse exactly.
   *  - Otherwise assign a stable different browserBrand from BROWSER_BRANDS (Chrome, Safari,
   *    Edge, Firefox, Brave, Opera, …) and build + save fingerprint.
   *  - Launch real Playwright engine: chromium | firefox | webkit based on brand.
   *    (Other brands are spoofed via UA / Client Hints / navigator on closest engine.)
   */
  async _launchGuestViewProfile(profileName) {
    const userDataDir = profileDir(profileName);
    const isHeadless = process.env.HEADLESS !== 'false';
    const { args: baseArgs, width, height, lowMem } = vmwareArgs();
    let args = [...baseArgs];
    if (!isHeadless) {
      // Extra safety: strip black-screen flags if still present
      const kill = new Set([
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--single-process',
        '--in-process-gpu',
        '--no-zygote',
        '--renderer-process-limit=1',
      ]);
      args = args.filter((a) => !kill.has(a));
      if (!args.includes('--start-maximized')) args.push('--start-maximized');
      console.log('[VIEWS] HEADLESS=false → headed window (no black-screen flags)');
    }
    // Anti-automation flags (navigator.webdriver → false via init script)
    if (!args.includes('--disable-blink-features=AutomationControlled')) {
      args.push('--disable-blink-features=AutomationControlled');
    }
    args.push('--disable-infobars');
    args.push('--no-default-browser-check');
    args.push('--no-first-run');

    // ----- CHANGE: load existing brand + fingerprint from DB (reuse next time) -----
    let existingDoc = null;
    try {
      existingDoc = await ViewBot.findOne({ profileName }).lean();
    } catch (e) {
      console.warn(`[VIEWS] ${profileName} ViewBot load fail:`, e.message);
    }

    let fp;
    let browserBrand;
    let engine;

    if (
      existingDoc &&
      existingDoc.fingerprint &&
      existingDoc.fingerprint.userAgent &&
      (existingDoc.browserBrand || existingDoc.fingerprint.browserBrand)
    ) {
      // Reuse saved fingerprint + brand (same profile → same identity forever)
      fp = existingDoc.fingerprint;
      browserBrand = existingDoc.browserBrand || fp.browserBrand || pickStableBrowserBrand(profileName);
      engine = existingDoc.engine || fp.engine || getEngineForBrand(browserBrand);
      // Ensure fields present on fp object for logging / init script
      fp.browserBrand = browserBrand;
      fp.engine = engine;
      console.log(
        `[VIEWS] ${profileName} REUSE saved brand=${browserBrand} engine=${engine}`
      );
    } else {
      // First time: assign stable different brand, build FP, persist
      browserBrand = pickStableBrowserBrand(profileName);
      fp = buildFingerprint(profileName, { lowMem, browserBrand });
      engine = fp.engine || getEngineForBrand(browserBrand);
      console.log(
        `[VIEWS] ${profileName} NEW brand=${browserBrand} engine=${engine} (saved for next runs)`
      );
    }

    logFingerprint(fp);

    // Persist fingerprint + brand so next view uses the exact same identity
    await this._upsertViewBotDb(profileName, {
      fingerprint: fp,
      browserBrand,
      engine,
    });

    const fpOpts = contextOptionsFromFp(fp);
    const launchOpts = {
      headless: !!isHeadless,
      args: engine === 'chromium' ? args : args.filter((a) => !String(a).startsWith('--')), // firefox/webkit ignore most chrome flags
      ignoreDefaultArgs: engine === 'chromium' ? ['--enable-automation'] : undefined,
      ...fpOpts,
      viewport: lowMem
        ? { width: width || 1024, height: height || 576 }
        : fpOpts.viewport || { width: 1366, height: 768 },
    };

    // Chromium-family: prefer system path / channel when it matches brand
    if (engine === 'chromium') {
      const meta = getBrandMeta(browserBrand);
      const chromePath = findChromePath();
      // Brave brand → prefer Brave path if present
      if (browserBrand === 'Brave' && chromePath && /brave/i.test(chromePath)) {
        launchOpts.executablePath = chromePath;
        console.log(`[VIEWS] ${profileName} executablePath (Brave):`, chromePath);
      } else if (meta.channel && !chromePath) {
        // Playwright installed browser channel (chrome / msedge / chromium)
        launchOpts.channel = meta.channel;
        console.log(`[VIEWS] ${profileName} channel=${meta.channel}`);
      } else if (chromePath && (browserBrand === 'Google Chrome' || browserBrand === 'Chromium' || browserBrand === 'Brave')) {
        launchOpts.executablePath = chromePath;
        console.log(`[VIEWS] ${profileName} executablePath:`, chromePath);
      } else if (meta.channel) {
        try {
          launchOpts.channel = meta.channel;
          console.log(`[VIEWS] ${profileName} channel=${meta.channel}`);
        } catch (_) {}
      }
    }

    console.log(
      `[VIEWS] ${profileName} launchPersistentContext engine=${engine} brand=${browserBrand} dir=${userDataDir} headless=${isHeadless}`
    );

    // CHANGE: pick Playwright API by engine (not always chromium)
    let context;
    try {
      if (engine === 'firefox') {
        context = await firefox.launchPersistentContext(userDataDir, {
          headless: !!isHeadless,
          ...fpOpts,
          viewport: launchOpts.viewport,
        });
      } else if (engine === 'webkit') {
        context = await webkit.launchPersistentContext(userDataDir, {
          headless: !!isHeadless,
          ...fpOpts,
          viewport: launchOpts.viewport,
        });
      } else {
        context = await chromium.launchPersistentContext(userDataDir, launchOpts);
      }
    } catch (launchErr) {
      // Fallback to bundled chromium if channel/path/engine fails
      console.warn(
        `[VIEWS] ${profileName} ${engine} launch failed (${launchErr.message}) → fallback chromium`
      );
      const fallbackOpts = { ...launchOpts };
      delete fallbackOpts.channel;
      delete fallbackOpts.executablePath;
      context = await chromium.launchPersistentContext(userDataDir, fallbackOpts);
      engine = 'chromium';
    }

    try {
      // 1) FIRST: force navigator.webdriver = false before any page script
      await context.addInitScript(() => {
        try {
          Object.defineProperty(navigator, 'webdriver', {
            get: () => false,
            configurable: true,
          });
        } catch (_) {}
        try {
          Object.defineProperty(Navigator.prototype, 'webdriver', {
            get: () => false,
            configurable: true,
          });
        } catch (_) {}
      });

      // 2) Full human fingerprint (UA, WebGL, canvas, plugins, chrome.*)
      if (typeof fingerprintInitScript === 'function') {
        const script = fingerprintInitScript(fp);
        if (script) {
          const payload =
            typeof initScriptPayload === 'function' ? initScriptPayload(fp) : undefined;
          if (payload !== undefined) await context.addInitScript(script, payload);
          else await context.addInitScript(script);
        }
      }
      // Client Hints for chromium-family
      const ch = clientHintHeaders(fp);
      if (ch && Object.keys(ch).length) {
        await context.setExtraHTTPHeaders(ch).catch(() => {});
      }
    } catch (_) {}

    const page = context.pages()[0] || (await context.newPage());
    // Re-apply webdriver=false on this page immediately (belt + suspenders)
    try {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
      });
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
      });
    } catch (_) {}
    return { context, page, profileName, userDataDir, browserBrand, engine, fingerprint: fp };
  }

  /**
   * Warm-up: YouTube home → random keyword search → open a video → watch 20–30s + scroll.
   * Builds real YouTube cookies inside the persistent profile.
   */
  async _warmUpGuestProfile(page, profileName) {
    const marker = path.join(profileDir(profileName), '.warmed');
    const force = process.env.VIEW_FORCE_WARMUP === 'true';
    if (!force && fs.existsSync(marker)) {
      console.log(`[VIEWS] ${profileName} warm-up skip (already warmed)`);
      return false;
    }

    console.log(`[VIEWS] ${profileName} warm-up start...`);
    try {
      await page.goto('https://www.youtube.com/', {
        waitUntil: 'domcontentloaded',
        timeout: navTimeout(),
      });
      await sleep(2000 + Math.floor(Math.random() * 1500));
      await this._dismissBanners(page);

      const kw = WARMUP_KEYWORDS[Math.floor(Math.random() * WARMUP_KEYWORDS.length)];
      // Human-like: click search box and type (not only ?search_query= URL)
      let typed = false;
      try {
        const searchBox = page.locator(
          'input#search, input[name="search_query"], input[aria-label*="Search" i]'
        ).first();
        if (await searchBox.isVisible({ timeout: 4000 }).catch(() => false)) {
          await searchBox.click({ timeout: 3000 });
          await sleep(300 + Math.floor(Math.random() * 400));
          await searchBox.fill('');
          // type with small gaps like a human
          for (const ch of kw) {
            await page.keyboard.type(ch, { delay: 60 + Math.floor(Math.random() * 120) });
          }
          await sleep(400 + Math.floor(Math.random() * 500));
          await page.keyboard.press('Enter');
          typed = true;
          await sleep(2200 + Math.floor(Math.random() * 1800));
        }
      } catch (_) {}
      if (!typed) {
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(kw)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: navTimeout() });
        await sleep(2000 + Math.floor(Math.random() * 2000));
      }
      await this._dismissBanners(page);

      // Scroll results slowly (human reading results)
      for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
        await page.evaluate(() => window.scrollBy(0, 180 + Math.floor(Math.random() * 220)));
        await sleep(900 + Math.floor(Math.random() * 900));
      }

      // Hover then click thumbnail (not instant click)
      const thumbs = page.locator('ytd-video-renderer a#thumbnail, ytd-rich-item-renderer a#thumbnail');
      const n = await thumbs.count().catch(() => 0);
      if (n > 0) {
        const pick = Math.min(n - 1, Math.floor(Math.random() * Math.min(n, 4)));
        const th = thumbs.nth(pick);
        try {
          await th.hover({ timeout: 4000 });
          await sleep(250 + Math.floor(Math.random() * 450));
        } catch (_) {}
        await th.click({ timeout: 8000 }).catch(() => {});
        await sleep(2500 + Math.floor(Math.random() * 1200));
        await this._dismissBanners(page);
        await this._humanStartVideo(page, profileName).catch(() => {});
        const warmSec = 20 + Math.floor(Math.random() * 11); // 20–30s
        console.log(`[VIEWS] ${profileName} warm-up watch ${warmSec}s`);
        await sleep(warmSec * 1000);
        // light scroll during watch
        await page.evaluate(() => window.scrollBy(0, 200)).catch(() => {});
        await sleep(1000);
      }

      try {
        fs.writeFileSync(marker, new Date().toISOString(), 'utf8');
      } catch (_) {}
      // Cookies already on disk via persistent context; also mirror to ViewBot DB after warm-up
      try {
        const ctx = page.context();
        await this._saveViewBotCookiesFromContext(ctx, profileName, {
          warmed: true,
          lastWarmupAt: new Date(),
        });
      } catch (_) {}
      console.log(`[VIEWS] ${profileName} warm-up done – cookies in profile + DB`);
      return true;
    } catch (e) {
      console.warn(`[VIEWS] ${profileName} warm-up error:`, e.message);
      return false;
    }
  }

  /**
   * CHANGE (2026-11): Search by title (natural), BUT only open OUR video (videoId match).
   * - Never click first/random result (that opened wrong videos before).
   * - If exact match not in results → direct goto order link.
   * - Always ends on the video URL we were given – no other person's video.
   */
  async _searchAndOpenTargetVideo(page, profileName, videoUrl, videoTitle, videoId) {
    const target =
      videoUrl ||
      (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);
    if (!target) {
      throw new Error('No videoUrl / videoId to open');
    }

    const query = (videoTitle || videoId || '').trim();

    // ----- 1) Search by title (looks human) -----
    if (query) {
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      console.log(`[VIEWS] ${profileName} search: "${query.slice(0, 80)}"`);
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: navTimeout() });
      await sleep(1800 + Math.floor(Math.random() * 1600));
      await this._dismissBanners(page).catch(() => {});

      // Light scroll on results (human)
      try {
        await page.evaluate(() => window.scrollBy(0, 150 + Math.floor(Math.random() * 300)));
      } catch (_) {}
      await sleep(500 + Math.floor(Math.random() * 800));

      // ----- 2) ONLY click result that contains OUR videoId – never first/random -----
      let openedOurVideo = false;
      if (videoId) {
        try {
          const exact = page
            .locator(
              `a#thumbnail[href*="watch?v=${videoId}"], a#video-title[href*="watch?v=${videoId}"], a[href*="watch?v=${videoId}"]`
            )
            .first();
          const n = await exact.count().catch(() => 0);
          if (n > 0) {
            console.log(`[VIEWS] ${profileName} found OUR video in search → click`);
            await exact.click({ timeout: 10000 }).catch(() => {});
            await sleep(2000 + Math.floor(Math.random() * 1200));
            const cur = page.url() || '';
            if (cur.includes(videoId) || /\/shorts\//i.test(cur)) {
              openedOurVideo = true;
            }
          } else {
            console.log(
              `[VIEWS] ${profileName} OUR videoId not in search results → will direct open`
            );
          }
        } catch (e) {
          console.warn(`[VIEWS] ${profileName} exact-match click fail:`, e.message);
        }
      }

      // ----- 3) If we did NOT land on our video → direct goto (never keep wrong video) -----
      if (!openedOurVideo) {
        const cur = page.url() || '';
        if (videoId && cur.includes(videoId)) {
          openedOurVideo = true;
        } else {
          console.log(`[VIEWS] ${profileName} direct open our link (no wrong video)`);
          await page.goto(target, {
            waitUntil: 'domcontentloaded',
            timeout: navTimeout(),
          });
          await sleep(1600 + Math.floor(Math.random() * 1200));
        }
      }
    } else {
      // No title – direct only
      console.log(`[VIEWS] ${profileName} no title → direct open`);
      await page.goto(target, {
        waitUntil: 'domcontentloaded',
        timeout: navTimeout(),
      });
      await sleep(1600 + Math.floor(Math.random() * 1200));
    }

    // ----- 4) Final safety: must be on our videoId -----
    if (videoId) {
      const landed = page.url() || '';
      if (!landed.includes(videoId) && !/\/shorts\//i.test(landed)) {
        console.warn(
          `[VIEWS] ${profileName} still not on our video → force watch?v=${videoId}`
        );
        await page.goto(`https://www.youtube.com/watch?v=${videoId}`, {
          waitUntil: 'domcontentloaded',
          timeout: navTimeout(),
        });
        await sleep(1500 + Math.floor(Math.random() * 900));
      }
    }

    await this._dismissBanners(page).catch(() => {});
    await sleep(700 + Math.floor(Math.random() * 600));
  }

  /**
   * CHANGE (2026-11): After warm-up, open the EXACT order video URL directly (no title search).
   * Search-by-name often opened the wrong video; this always hits the link we were given.
   * Still human-like / smooth: short home pause → light scroll → goto watch URL → settle.
   */
  async _openTargetVideoDirectSmooth(page, profileName, videoUrl, videoId) {
    const target =
      videoUrl ||
      (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);
    if (!target) {
      throw new Error('No videoUrl / videoId to open');
    }

    console.log(`[VIEWS] ${profileName} direct open (no search): ${target.slice(0, 80)}`);

    // 1) Soft land on YouTube home (or stay if already on YT) – looks less robotic than cold goto
    try {
      const cur = page.url() || '';
      if (!/youtube\.com/i.test(cur)) {
        await page.goto('https://www.youtube.com/', {
          waitUntil: 'domcontentloaded',
          timeout: navTimeout(),
        });
      } else if (!/youtube\.com\/?$/i.test(cur) && !/youtube\.com\/\?/i.test(cur)) {
        // Come back to home briefly after warm-up watch
        await page.goto('https://www.youtube.com/', {
          waitUntil: 'domcontentloaded',
          timeout: navTimeout(),
        });
      }
    } catch (_) {
      await page.goto('https://www.youtube.com/', {
        waitUntil: 'domcontentloaded',
        timeout: navTimeout(),
      }).catch(() => {});
    }

    await sleep(1200 + Math.floor(Math.random() * 1800));
    await this._dismissBanners(page).catch(() => {});

    // 2) Light human scroll on home
    try {
      await page.evaluate(() => window.scrollBy(0, 120 + Math.floor(Math.random() * 280)));
    } catch (_) {}
    await sleep(600 + Math.floor(Math.random() * 900));

    // 3) Direct navigation to the order link (exact video)
    await page.goto(target, {
      waitUntil: 'domcontentloaded',
      timeout: navTimeout(),
    });
    await sleep(1800 + Math.floor(Math.random() * 1600));
    await this._dismissBanners(page).catch(() => {});

    // 4) Verify we landed on the right video; one retry if URL drifted
    if (videoId) {
      const landed = page.url() || '';
      if (!landed.includes(videoId) && !/\/shorts\//i.test(landed)) {
        console.warn(
          `[VIEWS] ${profileName} URL mismatch after goto → retry direct watch?v=${videoId}`
        );
        await page.goto(`https://www.youtube.com/watch?v=${videoId}`, {
          waitUntil: 'domcontentloaded',
          timeout: navTimeout(),
        });
        await sleep(1500 + Math.floor(Math.random() * 1000));
        await this._dismissBanners(page).catch(() => {});
      }
    }

    // 5) Short settle before play (smooth)
    await sleep(800 + Math.floor(Math.random() * 700));
  }


  /**
   * CHANGE: Read visible video title from watch page.
   */
  async _readVideoTitleFromPage(page) {
    try {
      const t = await page.evaluate(() => {
        const el =
          document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
          document.querySelector('h1 yt-formatted-string') ||
          document.querySelector('h1.title') ||
          document.querySelector('meta[name="title"]') ||
          document.querySelector('meta[property="og:title"]');
        if (!el) return '';
        if (el.getAttribute && el.getAttribute('content')) return el.getAttribute('content');
        return (el.textContent || '').trim();
      });
      return (t || '').replace(/\s+/g, ' ').trim();
    } catch (_) {
      return '';
    }
  }

  /**
   * CHANGE: Search box open → type title → results → click a RANDOM video
   * (prefer NOT our videoId so it is a different video).
   */
  async _searchTitleAndOpenRandomVideo(page, profileName, title, ourVideoId) {
    const q = (title || ourVideoId || 'youtube').trim();
    console.log(`[VIEWS] ${profileName} search query: "${q.slice(0, 60)}"`);

    // Always land on results URL first (more reliable in headless than typing only)
    const resultsUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    try {
      await page.goto(resultsUrl, {
        waitUntil: 'domcontentloaded',
        timeout: navTimeout(),
      });
    } catch (e) {
      console.warn(`[VIEWS] ${profileName} results goto fail:`, e.message);
    }

    await sleep(2500 + Math.floor(Math.random() * 1500));
    await this._dismissBanners(page).catch(() => {});

    // Wait for result nodes (YouTube hydrates slow in headless)
    try {
      await page.waitForSelector(
        'ytd-video-renderer, ytd-rich-item-renderer, a#video-title, a[href*="watch?v="]',
        { timeout: 20000 }
      );
    } catch (_) {
      console.warn(`[VIEWS] ${profileName} search DOM slow – scrolling to load`);
    }

    // Scroll to trigger lazy load
    for (let i = 0; i < 3; i++) {
      try {
        await page.evaluate(() => window.scrollBy(0, 400 + Math.floor(Math.random() * 300)));
      } catch (_) {}
      await sleep(700 + Math.floor(Math.random() * 500));
    }
    await this._dismissBanners(page).catch(() => {});

    const clicked = await this._clickRandomSearchResult(page, profileName, ourVideoId);
    if (!clicked) {
      // Last resort: open a known public video so step2 does not die empty
      console.warn(`[VIEWS] ${profileName} search empty → fallback popular video`);
      try {
        await page.goto('https://www.youtube.com/watch?v=jNQXAC9IVRw', {
          waitUntil: 'domcontentloaded',
          timeout: navTimeout(),
        });
        await sleep(2000);
        await this._dismissBanners(page).catch(() => {});
        return true;
      } catch (_) {
        return false;
      }
    }
    return true;
  }

  /**
   * Click a random search result thumbnail. Prefer links that are NOT our videoId.
   */
  async _clickRandomSearchResult(page, profileName, ourVideoId) {
    try {
      const hrefs = await page.evaluate((skipId) => {
        const sels = [
          'ytd-video-renderer a#thumbnail[href]',
          'ytd-video-renderer a#video-title[href]',
          'ytd-rich-item-renderer a#thumbnail[href]',
          'a#video-title[href*="watch"]',
          'a[href*="/watch?v="]',
        ];
        const seen = new Set();
        const out = [];
        for (const sel of sels) {
          for (const a of Array.from(document.querySelectorAll(sel))) {
            let href = a.getAttribute('href') || '';
            if (!href) continue;
            // normalize
            if (href.startsWith('/')) href = href;
            if (!href.includes('watch') && !href.includes('/shorts/')) continue;
            if (skipId && href.includes(skipId)) continue;
            if (seen.has(href)) continue;
            seen.add(href);
            out.push(href);
          }
        }
        return out.slice(0, 25);
      }, ourVideoId || '');

      let list = hrefs || [];
      if (!list.length) {
        list = await page.evaluate(() => {
          const nodes = Array.from(document.querySelectorAll('a[href*="watch?v="], a[href*="/shorts/"]'));
          const out = [];
          for (const a of nodes) {
            const href = a.getAttribute('href') || '';
            if (href) out.push(href);
          }
          return out.slice(0, 20);
        });
      }

      if (!list.length) {
        console.warn(`[VIEWS] ${profileName} no search results to click`);
        return false;
      }

      const pick = list[Math.floor(Math.random() * list.length)];
      const abs = pick.startsWith('http') ? pick : `https://www.youtube.com${pick}`;
      console.log(`[VIEWS] ${profileName} random result → ${abs.slice(0, 90)}`);
      await page.goto(abs, { waitUntil: 'domcontentloaded', timeout: navTimeout() });
      await sleep(1800 + Math.floor(Math.random() * 1200));
      await this._dismissBanners(page).catch(() => {});
      return true;
    } catch (e) {
      console.warn(`[VIEWS] ${profileName} random result fail:`, e.message);
      return false;
    }
  }

  /**
   * After main watch: open another random (related or search) video.
   */
  async _openRandomRelatedOrSearchVideo(page, profileName, title, ourVideoId) {
    // Try related / sidebar on current page first
    try {
      const related = await page.evaluate((skipId) => {
        const nodes = Array.from(
          document.querySelectorAll(
            'ytd-compact-video-renderer a#thumbnail[href*="watch"], ytd-watch-next-secondary-results-renderer a[href*="watch"]'
          )
        );
        const hrefs = [];
        for (const a of nodes) {
          const href = a.getAttribute('href') || '';
          if (!href.includes('watch')) continue;
          if (skipId && href.includes(skipId)) continue;
          hrefs.push(href);
        }
        return hrefs.slice(0, 12);
      }, ourVideoId || '');

      if (related && related.length) {
        const pick = related[Math.floor(Math.random() * related.length)];
        const abs = pick.startsWith('http') ? pick : `https://www.youtube.com${pick}`;
        console.log(`[VIEWS] ${profileName} related random → ${abs.slice(0, 90)}`);
        await page.goto(abs, { waitUntil: 'domcontentloaded', timeout: navTimeout() });
        await sleep(1500 + Math.floor(Math.random() * 1000));
        await this._dismissBanners(page).catch(() => {});
        return true;
      }
    } catch (_) {}

    // Fallback: search title again and pick random
    await this._searchTitleAndOpenRandomVideo(page, profileName, title, ourVideoId);
    return true;
  }

  /**
   * Watch for fixed seconds with mouse move + light scroll (video keeps playing).
   */
  async _watchForSecondsWithActivity(page, profileName, seconds) {
    const sec = Math.max(1, parseInt(seconds, 10) || 10);
    console.log(`[VIEWS] ${profileName} activity-watch ${sec}s (start)`);
    try {
      await page.evaluate(async () => {
        const video =
          document.querySelector('video') || document.querySelector('#movie_player video');
        if (!video) return;
        try {
          video.muted = false;
          video.volume = 0.15;
        } catch (_) {
          video.muted = true;
        }
        try {
          await video.play();
        } catch (_) {
          video.muted = true;
          await video.play().catch(() => {});
          const p = document.querySelector('#movie_player');
          if (p) p.click();
        }
      });
    } catch (_) {}

    const endAt = Date.now() + sec * 1000;
    let lastLog = Date.now();
    while (Date.now() < endAt) {
      // progress log every ~10s so it does not look "stuck"
      if (Date.now() - lastLog >= 10000) {
        const left = Math.max(0, Math.round((endAt - Date.now()) / 1000));
        console.log(`[VIEWS] ${profileName} activity-watch … ${left}s left`);
        lastLog = Date.now();
      }

      // Skip ads continuously
      try {
        await this._skipAdsIfPresent(page, profileName);
      } catch (_) {}

      try {
        await page.mouse.move(
          100 + Math.random() * 500,
          100 + Math.random() * 320,
          { steps: 6 + Math.floor(Math.random() * 10) }
        );
      } catch (_) {}

      // Smooth human-like scroll (both directions)
      try {
        if (Math.random() > 0.35) {
          const dir = Math.random() > 0.3 ? 1 : -1;
          const amount = 40 + Math.floor(Math.random() * 140);
          await page.evaluate(
            ({ d, a }) => window.scrollBy({ top: d * a, left: 0, behavior: 'smooth' }),
            { d: dir, a: amount }
          );
        }
      } catch (_) {}

      try {
        await page.evaluate(() => {
          const video =
            document.querySelector('video') || document.querySelector('#movie_player video');
          if (video && video.paused) video.play().catch(() => {});
        });
      } catch (_) {}
      const leftMs = endAt - Date.now();
      if (leftMs <= 0) break;
      await sleep(Math.min(700 + Math.floor(Math.random() * 600), leftMs));
    }
    console.log(`[VIEWS] ${profileName} activity-watch ${sec}s (done)`);
  }

  /**
   * Full guest view session with persistent profile.
   *
   * CHANGE (2026-11) – human-like multi-step flow:
   *  1) Open our video URL → read title
   *  2) Search that title → open a RANDOM other video → watch 40s
   *  3) Close it → open OUR video URL again
   *  4) Watch our video for configured time (cursor move + page scroll, video stays playing)
   *  5) Open another random video → watch 10s → close
   *  6) YouTube home/page scroll ~5s
   */
  async _performGuestView(videoUrl, { profileName, videoId, videoTitle }) {
    const result = {
      botName: profileName,
      success: false,
      viewed: false,
      watchedSeconds: 0,
      error: null,
      profile: profileName,
    };

    let context;
    try {
      if (videoId && isViewProfileOnCooldown(profileName, videoId)) {
        throw new Error(`Profile ${profileName} on 48h cooldown for video ${videoId}`);
      }

      const launched = await this._launchGuestViewProfile(profileName);
      context = launched.context;
      const page = launched.page;

      // Optional one-time warm-up (first profile use)
      await this._warmUpGuestProfile(page, profileName);

      const targetUrl =
        videoUrl ||
        (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);
      if (!targetUrl) throw new Error('No videoUrl / videoId');

      // ========== 1) Open OUR video first → copy title ==========
      console.log(`[VIEWS] ${profileName} step1 open our URL`);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: navTimeout() });
      await sleep(2000 + Math.floor(Math.random() * 1500));
      await this._dismissBanners(page).catch(() => {});

      let title = (videoTitle || '').trim();
      if (!title) {
        title = await this._readVideoTitleFromPage(page);
      }
      if (!title && videoId) title = videoId;
      console.log(`[VIEWS] ${profileName} title: "${(title || '').slice(0, 80)}"`);

      // ========== 2) Search title → open RANDOM video → watch 40s ==========
      console.log(`[VIEWS] ${profileName} step2 search title → random video 40s`);
      await this._searchTitleAndOpenRandomVideo(page, profileName, title, videoId);
      await this._humanStartVideo(page, profileName).catch(() => {});
      await this._watchForSecondsWithActivity(page, profileName, 40);

      // ========== 3) Back to OUR video URL ==========
      console.log(`[VIEWS] ${profileName} step3 open our URL again`);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: navTimeout() });
      await sleep(1800 + Math.floor(Math.random() * 1200));
      await this._dismissBanners(page).catch(() => {});

      // Safety: must be on our videoId
      if (videoId) {
        const landed = page.url() || '';
        if (!landed.includes(videoId)) {
          await page.goto(`https://www.youtube.com/watch?v=${videoId}`, {
            waitUntil: 'domcontentloaded',
            timeout: navTimeout(),
          });
          await sleep(1500);
          await this._dismissBanners(page).catch(() => {});
        }
      }

      await page
        .waitForSelector('video, ytd-player, #movie_player', { timeout: actionTimeout() })
        .catch(() => {});
      await this._humanStartVideo(page, profileName);
      await this._skipAdsIfPresent(page, profileName);

      // ========== 4) Watch OUR video (configured time) + cursor + scroll ==========
      console.log(`[VIEWS] ${profileName} step4 watch our video (cursor + scroll)`);
      const watchSec = await this._watchVideo(page, profileName, {
        viewOnly: true,
        watchHours: false,
        // keep page activity – _watchVideo already moves mouse; extra scroll below
      });
      result.watchedSeconds = watchSec;
      result.viewed = true;
      result.success = true;

      // ========== 5) Another random video → 10s ==========
      console.log(`[VIEWS] ${profileName} step5 random video 10s`);
      try {
        await this._openRandomRelatedOrSearchVideo(page, profileName, title, videoId);
        await this._humanStartVideo(page, profileName).catch(() => {});
        await this._watchForSecondsWithActivity(page, profileName, 10);
      } catch (e) {
        console.warn(`[VIEWS] ${profileName} step5 random 10s skip:`, e.message);
      }

      // ========== 6) YouTube page scroll ~5s ==========
      console.log(`[VIEWS] ${profileName} step6 youtube scroll 5s`);
      try {
        await page.goto('https://www.youtube.com/', {
          waitUntil: 'domcontentloaded',
          timeout: navTimeout(),
        });
        await this._dismissBanners(page).catch(() => {});
        const scrollEnd = Date.now() + 5000;
        while (Date.now() < scrollEnd) {
          await page
            .evaluate(() => window.scrollBy(0, 180 + Math.floor(Math.random() * 320)))
            .catch(() => {});
          await sleep(700 + Math.floor(Math.random() * 600));
          try {
            const vw = await page.evaluate(() => ({
              w: window.innerWidth,
              h: window.innerHeight,
            }));
            await page.mouse.move(
              80 + Math.random() * (vw.w - 160),
              80 + Math.random() * (vw.h - 160),
              { steps: 4 + Math.floor(Math.random() * 8) }
            );
          } catch (_) {}
        }
      } catch (e) {
        console.warn(`[VIEWS] ${profileName} step6 scroll skip:`, e.message);
      }

      if (videoId) markViewProfileWatched(profileName, videoId);

      // Save cookies + cooldown + stats to ViewBot collection (before close)
      try {
        const cookies = normalizeCookies((await context.cookies()) || []);
        const cooldownPatch = {};
        if (videoId) {
          cooldownPatch[`videoCooldown.${videoId}`] = new Date();
        }
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
        console.log(
          `[VIEWS] ${profileName} DB ok | cookies=${cookies.length} totalViews++ video=${videoId || '-'}`
        );
      } catch (dbErr) {
        console.warn(`[VIEWS] ${profileName} DB save after watch:`, dbErr.message);
      }

      console.log(
        `[VIEWS] ${profileName} ✅ watched ${watchSec}s our video + human session (guest persistent)`
      );
    } catch (err) {
      result.error = err.message || String(err);
      console.error(`[VIEWS] ${profileName} failed:`, result.error);
    } finally {
      // Close browser context – profile folder + cookies STAY on disk
      if (context) {
        await context.close().catch(() => {});
      }
    }

    return result;
  }

  /**
   * Watch hours: very long watch per bot (no like/comment).
   * Quantity = bots. Duration: WATCH_HOUR_TIME_MIN/MAX (default 30–60 min).
   * Total watch hours ≈ bots × average session length.
   */
  async processWatchHours(videoUrl, opts = {}) {
    let bots = [];
    if (opts.botName) {
      const bot = await Bot.findOne({ botName: opts.botName });
      if (!bot) throw new Error(`Bot "${opts.botName}" not found`);
      bots = [bot];
    } else {
      const count = opts.botCount || 1;
      bots = await this._pickRandomBots(count);
    }

    const concurrency = getBotConcurrency(bots.length);
    const staggerBase = Math.max(0, parseInt(process.env.BOT_STAGGER_MS || '7000', 10));
    const staggerJitter = Math.max(0, parseInt(process.env.BOT_STAGGER_JITTER_MS || '3000', 10));

    console.log(
      `[WATCH-HOURS] ${bots.length} bot(s) | concurrency=${concurrency} → ${videoUrl} | ${bots.map((b) => b.botName).join(',')}`
    );

    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    const results = await runWithConcurrency(bots, concurrency, async (bot, index) => {
      if (index < concurrency && (staggerBase > 0 || staggerJitter > 0)) {
        const delay =
          index * staggerBase + Math.floor(Math.random() * (staggerJitter + 1));
        if (delay > 0) {
          console.log(
            `[WATCH-HOURS] ${bot.botName} stagger wait ${Math.round(delay / 1000)}s (wave index=${index}/${concurrency})`
          );
          await sleep(delay);
        }
      }
      const result = await this.performActionWithBot(videoUrl, bot, {
        watchHours: true,
        viewOnly: true,
        doLike: false,
        doComment: false,
      });
      if (onProgress) {
        try {
          await onProgress(result);
        } catch (e) {
          console.warn('[WATCH-HOURS] onProgress error:', e.message);
        }
      }
      return result;
    });

    const totalSec = results.reduce((s, r) => s + (r && r.watchedSeconds ? r.watchedSeconds : 0), 0);
    console.log(
      `[WATCH-HOURS] Done ${results.length} | success=${results.filter((r) => r && r.success).length} | totalWatch≈${(totalSec / 3600).toFixed(2)}h`
    );
    return results;
  }

  async processMultipleLikes(videoUrl, botCount) {
    return this.processActions(videoUrl, {
      botCount,
      doLike: true,
      doComment: false
    });
  }

  async processSubscribe(url, opts = {}) {
    let bots = [];
    if (opts.botName) {
      const bot = await Bot.findOne({ botName: opts.botName });
      if (!bot) throw new Error(`Bot "${opts.botName}" not found`);
      bots = [bot];
    } else {
      const count = opts.botCount || 1;
      bots = await this._pickRandomBots(count);
    }

    const concurrency = getBotConcurrency(bots.length);
    console.log(
      `[SUBSCRIBE] ${bots.length} bot(s) | concurrency=${concurrency} → ${url} | ${bots.map((b) => b.botName).join(',')}`
    );
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    const results = await runWithConcurrency(bots, concurrency, async (bot) => {
      const result = await this.performSubscribeWithBot(url, bot);
      if (onProgress) {
        try {
          await onProgress(result);
        } catch (e) {
          console.warn('[SUBSCRIBE] onProgress error:', e.message);
        }
      }
      return result;
    });
    console.log(
      `[SUBSCRIBE] Done ${results.length} | success=${results.filter((r) => r && r.success).length}`
    );
    return results;
  }

  async _humanScroll(page, botName, rounds = 3) {
    console.log(`[${botName}] Human-like scroll (${rounds} rounds)...`);
    for (let i = 0; i < rounds; i++) {
      // Random direction + smooth behavior (looks less robotic)
      const dir = Math.random() > 0.25 ? 1 : -1;
      const delta = 180 + Math.floor(Math.random() * 420);
      await page.evaluate(
        ({ d, a }) => window.scrollBy({ top: d * a, left: 0, behavior: 'smooth' }),
        { d: dir, a: delta }
      );
      await sleep(600 + Math.floor(Math.random() * 1100));

      // Occasional micro-pause + small reverse scroll
      if (Math.random() > 0.55) {
        await page.evaluate(() =>
          window.scrollBy({ top: -(40 + Math.random() * 90), left: 0, behavior: 'smooth' })
        );
        await sleep(300 + Math.floor(Math.random() * 500));
      }

      try {
        const box = await page.evaluate(() => {
          const w = window.innerWidth || 800;
          const h = window.innerHeight || 600;
          return { w, h };
        });
        await page.mouse.move(
          60 + Math.random() * (box.w - 120),
          60 + Math.random() * (box.h - 120),
          { steps: 8 + Math.floor(Math.random() * 12) }
        );
      } catch (_) {}

      // Also try to clear any ads while scrolling
      try {
        await this._skipAdsIfPresent(page, botName);
      } catch (_) {}
    }
  }

  /**
   * Human-like subscribe:
   * 1) Open link → scroll
   * 2) Open a video (if on channel) / brief watch
   * 3) Back to channel
   * 4) Subscribe
   * 5) Scroll a bit more → close browser
   */
  async performSubscribeWithBot(url, botData) {
    console.log(`[SUBSCRIBE] ${botData.botName} → ${url}`);
    const isHeadless = process.env.HEADLESS !== 'false';
    const { browser, page } = await this._launchWithProfile(botData.botName, {
      headless: isHeadless
    });

    const result = {
      botName: botData.botName,
      success: false,
      subscribed: false,
      alreadySubscribed: false,
      error: null
    };

    try {
      await page.goto('https://www.youtube.com', {
        waitUntil: 'domcontentloaded',
        timeout: navTimeout()
      });
      await sleep(2000);
      await this._dismissBanners(page);

      let loggedIn = await this._isLoggedIn(page);
      if (!loggedIn) {
        const cookies = normalizeCookies(botData.cookies || []);
        const pwCookies = cookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain || '.youtube.com',
          path: c.path || '/',
          httpOnly: !!c.httpOnly,
          secure: c.secure !== false,
          ...(c.expires ? { expires: c.expires } : {}),
          ...(c.sameSite ? { sameSite: c.sameSite } : {})
        }));
        try {
          await browser.addCookies(pwCookies);
        } catch (_) {}
        await page.goto('https://www.youtube.com', {
          waitUntil: 'domcontentloaded',
          timeout: navTimeout()
        });
        await sleep(2000);
        loggedIn = await this._isLoggedIn(page);
      }

      if (!loggedIn) {
        throw new Error('Session expired. POST /api/bot/refresh/' + botData.botName);
      }
      console.log(`[${botData.botName}] ✅ Logged in`);

      // 1) Open target URL
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeout() });
      await sleep(2500 + Math.floor(Math.random() * 1500));
      await this._dismissBanners(page);

      // 2) Human scroll on landing page
      await this._humanScroll(page, botData.botName, 2 + Math.floor(Math.random() * 2));

      const pageUrl = page.url();
      const isChannel =
        /\/@|\/channel\/|\/c\/|\/user\//i.test(pageUrl) ||
        /\/@|\/channel\/|\/c\/|\/user\//i.test(String(url));
      const isVideo =
        /[?&]v=|\/watch|\/shorts\//i.test(pageUrl) ||
        /[?&]v=|\/watch|\/shorts\//i.test(String(url));

      let channelUrl = null;

      // 3a) If video page → try open channel from owner link, remember it
      if (isVideo && !isChannel) {
        console.log(`[${botData.botName}] Video page – brief watch then channel...`);
        try {
          await page.evaluate(async () => {
            const video =
              document.querySelector('video') ||
              document.querySelector('#movie_player video');
            if (video) {
              video.muted = true;
              try {
                await video.play();
              } catch (_) {}
            }
          });
        } catch (_) {}
        await sleep(4000 + Math.floor(Math.random() * 4000));
        await this._humanScroll(page, botData.botName, 1);

        // Channel link on video page
        const chHref = await page.evaluate(() => {
          const a =
            document.querySelector('ytd-video-owner-renderer a[href]') ||
            document.querySelector('#owner #channel-name a') ||
            document.querySelector('#upload-info a[href*="/@"]') ||
            document.querySelector('ytd-channel-name a[href]');
          return a ? a.href : null;
        });
        if (chHref) {
          channelUrl = chHref;
          console.log(`[${botData.botName}] Going to channel: ${channelUrl}`);
          await page.goto(channelUrl, { waitUntil: 'domcontentloaded', timeout: navTimeout() });
          await sleep(2500);
          await this._dismissBanners(page);
          await this._humanScroll(page, botData.botName, 2);
        }
      }

      // 3b) If channel page → open one video, watch briefly, come back
      if (isChannel || channelUrl || /\/@|\/channel\/|\/c\//i.test(page.url())) {
        const beforeChannel = page.url();
        channelUrl = channelUrl || beforeChannel;
        console.log(`[${botData.botName}] Channel page – open a video then return...`);

        // Click a video thumbnail if present
        let openedVideo = false;
        try {
          const thumb = page.locator(
            'ytd-rich-item-renderer a#thumbnail, ytd-grid-video-renderer a#thumbnail, ytd-video-renderer a#thumbnail'
          ).first();
          if ((await thumb.count()) > 0) {
            await thumb.scrollIntoViewIfNeeded().catch(() => {});
            await sleep(500);
            await thumb.click({ timeout: 5000 });
            openedVideo = true;
            await sleep(3000);
            await this._dismissBanners(page);
            try {
              await page.evaluate(async () => {
                const video = document.querySelector('video');
                if (video) {
                  video.muted = true;
                  await video.play().catch(() => {});
                }
              });
            } catch (_) {}
            // Watch 5–12 sec
            await sleep(5000 + Math.floor(Math.random() * 7000));
            await this._humanScroll(page, botData.botName, 1);
            // Back to channel
            console.log(`[${botData.botName}] Back to channel...`);
            await page.goto(channelUrl, { waitUntil: 'domcontentloaded', timeout: navTimeout() });
            await sleep(2500);
            await this._dismissBanners(page);
            await this._humanScroll(page, botData.botName, 1 + Math.floor(Math.random() * 2));
          }
        } catch (e) {
          console.log(`[${botData.botName}] Video open skip: ${e.message}`);
        }
        if (!openedVideo) {
          await this._humanScroll(page, botData.botName, 2);
        }
      }

      // 4) Subscribe
      const subResult = await this._clickSubscribe(page, botData.botName);
      result.subscribed = subResult.subscribed;
      result.alreadySubscribed = !!subResult.alreadySubscribed;

      // 5) Post-subscribe human scroll
      await this._humanScroll(page, botData.botName, 1 + Math.floor(Math.random() * 2));
      await sleep(1500 + Math.floor(Math.random() * 1500));

      result.success = true;
      console.log(
        `[${botData.botName}] ✅ Subscribe flow done (subscribed=${result.subscribed}, already=${result.alreadySubscribed})`
      );
    } catch (err) {
      result.error = err.message;
      result.success = false;
      console.error(`[${botData.botName}] ❌`, err.message);
    }

    try {
      const updated = normalizeCookies(await this._getCookies(browser));
      if (updated.length) {
        await Bot.findOneAndUpdate(
          { _id: botData._id },
          { cookies: updated, updatedAt: new Date() }
        );
      }
    } catch (_) {}

    // 6) Close browser
    await browser.close().catch(() => {});
    return result;
  }

  async _clickSubscribe(page, botName) {
    const selectors = [
      'ytd-subscribe-button-renderer button',
      '#subscribe-button button',
      'button[aria-label*="Subscribe" i]',
      '#subscribe-button'
    ];

    for (const sel of selectors) {
      try {
        await page.waitForSelector(sel, { timeout: Math.min(actionTimeout(), 15000) });
        const btn = page.locator(sel).first();
        if ((await btn.count()) === 0) continue;

        const label = await btn.evaluate((el) => {
          return (
            (el.getAttribute('aria-label') || '') +
            ' ' +
            (el.textContent || '')
          ).toLowerCase();
        });

        if (label.includes('unsubscribe') || label.trim().startsWith('subscribed')) {
          console.log(`[${botName}] Already subscribed`);
          return { subscribed: true, alreadySubscribed: true };
        }
        if (!label.includes('subscribe')) continue;

        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await sleep(500);
        await btn.click({ delay: 50 }).catch(async () => {
          await page.evaluate((s) => document.querySelector(s)?.click(), sel);
        });
        console.log(`[${botName}] ✅ Subscribe clicked`);
        await sleep(2500);

        const nowSub = await page.evaluate(() => {
          const buttons = [...document.querySelectorAll('button')];
          return buttons.some((b) => {
            const t = (b.textContent || '').trim().toLowerCase();
            const a = (b.getAttribute('aria-label') || '').toLowerCase();
            return t === 'subscribed' || a.includes('unsubscribe');
          });
        });
        return { subscribed: true, alreadySubscribed: false, confirmed: nowSub };
      } catch (_) {}
    }

    const clicked = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button')];
      const sub = buttons.find((b) => {
        const t = (b.textContent || '').trim().toLowerCase();
        const a = (b.getAttribute('aria-label') || '').toLowerCase();
        return (
          (t === 'subscribe' || a.includes('subscribe')) &&
          !a.includes('unsubscribe') &&
          t !== 'subscribed'
        );
      });
      if (!sub) return false;
      sub.scrollIntoView({ block: 'center' });
      sub.click();
      return true;
    });

    if (!clicked) {
      throw new Error('Subscribe button not found (channel/video page?)');
    }
    console.log(`[${botName}] ✅ Subscribe clicked (fallback)`);
    await sleep(2500);
    return { subscribed: true, alreadySubscribed: false };
  }
}

module.exports = new BotService();
