/**
 * Per-bot / per-view-profile browser fingerprint spoofing for Playwright.
 * Same botName/profileName → stable fingerprint + same browser brand forever.
 * Different profiles → different FP + different browser brand.
 *
 * Level 1 coverage:
 *  - navigator (webdriver, platform, languages, hardware, plugins)
 *  - WebGL vendor/renderer
 *  - Canvas noise (seeded, stable)
 *  - AudioContext noise
 *  - screen + window outer size
 *  - ClientRects slight noise
 *  - Client Hints helpers (UA-CH data for headers)
 *  - Battery / connection soft stubs
 *  - Multi-browser brand spoofing (Chrome, Safari, Edge, Firefox, Brave, Opera, …)
 *
 * CHANGE (2026-11): Added BROWSER_BRANDS list + stable per-profile brand assignment.
 * Real Playwright engines remain chromium / firefox / webkit; other brands are
 * spoofed via UA + Client Hints + navigator while using the closest engine.
 */

'use strict';

const crypto = require('crypto');

// Dynamic real desktop UAs + matching viewports (user-agents package)
let UserAgent;
try {
  UserAgent = require('user-agents');
} catch (_) {
  UserAgent = null;
}

function hashSeed(str) {
  return crypto.createHash('sha256').update(String(str || 'default')).digest();
}

function pick(seed, arr) {
  return arr[seed[0] % arr.length];
}

function intFrom(seed, offset, min, max) {
  const n = seed[offset % seed.length];
  return min + (n % (max - min + 1));
}

// ---------------------------------------------------------------------------
// CHANGE: Full browser brand list (user request). Each view profile gets one
// stable brand. Playwright can only run chromium / firefox / webkit engines;
// the rest are spoofed (UA + CH + navigator) on the closest engine.
// ---------------------------------------------------------------------------
const BROWSER_BRANDS = [
  'Google Chrome',
  'Apple Safari',
  'Microsoft Edge',
  'Mozilla Firefox',
  'Brave',
  'Opera',
  'Opera GX',
  'Opera Mini',
  'Vivaldi',
  'Tor Browser',
  'DuckDuckGo',
  'LibreWolf',
  'Zen Browser',
  'Arc',
  'Dia',
  'Comet',
  'Samsung Internet',
  'UC Browser',
  'Chromium',
  'Waterfox',
  'Pale Moon',
  'Mullvad Browser',
  'Ecosia',
  'Aloha Browser',
  'Kiwi Browser',
  'Yandex Browser',
  'Maxthon',
  'Floorp',
  'Thorium',
  'Ungoogled Chromium',
];

/**
 * Map brand → real Playwright engine + optional channel + UA template pieces.
 * engine: 'chromium' | 'firefox' | 'webkit'
 * channel: Playwright chromium channel when available (chrome, msedge, …)
 */
const BRAND_META = {
  'Google Chrome': {
    engine: 'chromium',
    channel: 'chrome',
    chBrand: 'Google Chrome',
    uaHint: 'Chrome',
  },
  'Apple Safari': {
    engine: 'webkit',
    channel: null,
    chBrand: 'Safari',
    uaHint: 'Safari',
  },
  'Microsoft Edge': {
    engine: 'chromium',
    channel: 'msedge',
    chBrand: 'Microsoft Edge',
    uaHint: 'Edg',
  },
  'Mozilla Firefox': {
    engine: 'firefox',
    channel: null,
    chBrand: 'Firefox',
    uaHint: 'Firefox',
  },
  Brave: {
    engine: 'chromium',
    channel: null, // system Brave path preferred when available
    chBrand: 'Brave',
    uaHint: 'Chrome', // Brave is Chromium-based; UA often still has Chrome token
  },
  Opera: {
    engine: 'chromium',
    channel: null,
    chBrand: 'Opera',
    uaHint: 'OPR',
  },
  'Opera GX': {
    engine: 'chromium',
    channel: null,
    chBrand: 'Opera',
    uaHint: 'OPR',
  },
  'Opera Mini': {
    engine: 'chromium',
    channel: null,
    chBrand: 'Opera',
    uaHint: 'OPR',
  },
  Vivaldi: {
    engine: 'chromium',
    channel: null,
    chBrand: 'Vivaldi',
    uaHint: 'Vivaldi',
  },
  'Tor Browser': {
    engine: 'firefox',
    channel: null,
    chBrand: 'Firefox',
    uaHint: 'Firefox',
  },
  DuckDuckGo: {
    engine: 'chromium',
    channel: null,
    chBrand: 'DuckDuckGo',
    uaHint: 'Chrome',
  },
  LibreWolf: {
    engine: 'firefox',
    channel: null,
    chBrand: 'Firefox',
    uaHint: 'Firefox',
  },
  'Zen Browser': {
    engine: 'firefox',
    channel: null,
    chBrand: 'Firefox',
    uaHint: 'Firefox',
  },
  Arc: {
    engine: 'chromium',
    channel: null,
    chBrand: 'Arc',
    uaHint: 'Chrome',
  },
  Dia: {
    engine: 'chromium',
    channel: null,
    chBrand: 'Chromium',
    uaHint: 'Chrome',
  },
  Comet: {
    engine: 'chromium',
    channel: null,
    chBrand: 'Chromium',
    uaHint: 'Chrome',
  },
  'Samsung Internet': {
    engine: 'chromium',
    channel: null,
    chBrand: 'Samsung Internet',
    uaHint: 'SamsungBrowser',
  },
  'UC Browser': {
    engine: 'chromium',
    channel: null,
    chBrand: 'UC Browser',
    uaHint: 'UCBrowser',
  },
  Chromium: {
    engine: 'chromium',
    channel: 'chromium',
    chBrand: 'Chromium',
    uaHint: 'Chrome',
  },
  Waterfox: {
    engine: 'firefox',
    channel: null,
    chBrand: 'Firefox',
    uaHint: 'Firefox',
  },
  'Pale Moon': {
    engine: 'firefox',
    channel: null,
    chBrand: 'Firefox',
    uaHint: 'Firefox',
  },
  'Mullvad Browser': {
    engine: 'firefox',
    channel: null,
    chBrand: 'Firefox',
    uaHint: 'Firefox',
  },
  Ecosia: {
    engine: 'chromium',
    channel: null,
    chBrand: 'Chromium',
    uaHint: 'Chrome',
  },
  'Aloha Browser': {
    engine: 'chromium',
    channel: null,
    chBrand: 'Chromium',
    uaHint: 'Chrome',
  },
  'Kiwi Browser': {
    engine: 'chromium',
    channel: null,
    chBrand: 'Chromium',
    uaHint: 'Chrome',
  },
  'Yandex Browser': {
    engine: 'chromium',
    channel: null,
    chBrand: 'Yandex',
    uaHint: 'YaBrowser',
  },
  Maxthon: {
    engine: 'chromium',
    channel: null,
    chBrand: 'Chromium',
    uaHint: 'Chrome',
  },
  Floorp: {
    engine: 'firefox',
    channel: null,
    chBrand: 'Firefox',
    uaHint: 'Firefox',
  },
  Thorium: {
    engine: 'chromium',
    channel: null,
    chBrand: 'Chromium',
    uaHint: 'Chrome',
  },
  'Ungoogled Chromium': {
    engine: 'chromium',
    channel: 'chromium',
    chBrand: 'Chromium',
    uaHint: 'Chrome',
  },
};

/** Stable pick: same profileName always gets the same brand index. */
function pickStableBrowserBrand(profileName) {
  const seed = hashSeed(profileName || 'bot');
  // Use a few bytes so distribution is better than seed[0] alone
  const idx = (seed[0] + seed[1] * 31 + seed[2] * 17) % BROWSER_BRANDS.length;
  return BROWSER_BRANDS[idx];
}

function getBrandMeta(brand) {
  return (
    BRAND_META[brand] || {
      engine: 'chromium',
      channel: 'chrome',
      chBrand: 'Google Chrome',
      uaHint: 'Chrome',
    }
  );
}

function getEngineForBrand(brand) {
  return getBrandMeta(brand).engine;
}

// Fallback lists if user-agents package is missing
const FALLBACK_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

const FALLBACK_VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1280, height: 720 },
  { width: 1600, height: 900 },
  { width: 1024, height: 576 },
];

const LOCALES = [
  { locale: 'en-US', timezoneId: 'America/New_York', languages: ['en-US', 'en'] },
  { locale: 'en-GB', timezoneId: 'Europe/London', languages: ['en-GB', 'en'] },
  { locale: 'en-IN', timezoneId: 'Asia/Kolkata', languages: ['en-IN', 'en', 'hi'] },
  { locale: 'en-US', timezoneId: 'America/Los_Angeles', languages: ['en-US', 'en'] },
  { locale: 'en-US', timezoneId: 'Asia/Dubai', languages: ['en-US', 'en', 'ar'] },
];

const PLATFORMS = {
  win: { platform: 'Win32', oscpu: 'Windows NT 10.0; Win64; x64', uaPlatform: '"Windows"' },
  mac: { platform: 'MacIntel', oscpu: 'Intel Mac OS X 10_15_7', uaPlatform: '"macOS"' },
  linux: { platform: 'Linux x86_64', oscpu: 'Linux x86_64', uaPlatform: '"Linux"' },
};

const WEBGL = [
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 580 Series Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M1, OpenGL 4.1)' },
];

/**
 * Build a brand-specific desktop User-Agent string (stable via seed).
 * CHANGE: brand-aware UAs so each profile looks like a different browser.
 */
function buildBrandUserAgent(brand, seed, platKey) {
  const meta = getBrandMeta(brand);
  const chromeMajors = [128, 129, 130, 131, 132];
  const ffMajors = [128, 129, 130, 131, 132, 133];
  const safariMajors = [17, 17, 18, 18];
  const major =
    meta.engine === 'firefox'
      ? ffMajors[seed[3] % ffMajors.length]
      : meta.engine === 'webkit'
        ? safariMajors[seed[3] % safariMajors.length]
        : chromeMajors[seed[3] % chromeMajors.length];

  const winNT = 'Windows NT 10.0; Win64; x64';
  const macOS = 'Macintosh; Intel Mac OS X 10_15_7';
  const linux = 'X11; Linux x86_64';
  const osPart = platKey === 'mac' ? macOS : platKey === 'linux' ? linux : winNT;

  // Firefox-family
  if (meta.engine === 'firefox') {
    const rv = `${major}.0`;
    if (brand === 'Tor Browser') {
      return `Mozilla/5.0 (${osPart}; rv:${rv}) Gecko/20100101 Firefox/${rv}`;
    }
    if (brand === 'LibreWolf' || brand === 'Floorp' || brand === 'Waterfox' || brand === 'Pale Moon' || brand === 'Mullvad Browser' || brand === 'Zen Browser') {
      return `Mozilla/5.0 (${osPart}; rv:${rv}) Gecko/20100101 Firefox/${rv}`;
    }
    return `Mozilla/5.0 (${osPart}; rv:${rv}) Gecko/20100101 Firefox/${rv}`;
  }

  // Safari / WebKit
  if (meta.engine === 'webkit') {
    const v = major === 18 ? '18.0' : '17.6';
    return `Mozilla/5.0 (${macOS}) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${v} Safari/605.1.15`;
  }

  // Chromium-family – brand-specific tokens
  const chromeBase = `Mozilla/5.0 (${osPart}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;

  if (brand === 'Microsoft Edge') {
    return `${chromeBase} Edg/${major}.0.0.0`;
  }
  if (brand === 'Opera' || brand === 'Opera GX' || brand === 'Opera Mini') {
    return `${chromeBase} OPR/${major}.0.0.0`;
  }
  if (brand === 'Vivaldi') {
    return `${chromeBase} Vivaldi/${major}.0.0.0`;
  }
  if (brand === 'Yandex Browser') {
    return `${chromeBase} YaBrowser/${major}.0.0.0`;
  }
  if (brand === 'Samsung Internet') {
    return `Mozilla/5.0 (${osPart}) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/${Math.max(20, major - 100)}.0 Chrome/${major}.0.0.0 Safari/537.36`;
  }
  if (brand === 'UC Browser') {
    return `Mozilla/5.0 (${osPart}) AppleWebKit/537.36 (KHTML, like Gecko) UBrowser/${major}.0.0.0 Chrome/${major}.0.0.0 Safari/537.36`;
  }
  if (brand === 'Brave') {
    // Brave often presents as Chrome in UA; CH brand differs
    return chromeBase;
  }
  if (brand === 'Arc') {
    return chromeBase;
  }
  // Chrome, Chromium, Thorium, Ungoogled, Ecosia, etc.
  return chromeBase;
}

/**
 * Get a realistic desktop User-Agent + matching viewport from `user-agents` package.
 * Falls back to hard-coded lists if package is unavailable.
 * Uses bot seed so the same bot gets a consistent-ish choice across runs.
 */
function getDynamicDesktopUA(seed) {
  if (UserAgent) {
    try {
      const candidates = [];
      for (let i = 0; i < 8; i++) {
        const uaInst = new UserAgent({ deviceCategory: 'desktop' });
        const d = uaInst.data;
        if (d && d.userAgent && d.viewportWidth && d.viewportHeight) {
          candidates.push({
            userAgent: d.userAgent,
            viewportWidth: d.viewportWidth,
            viewportHeight: d.viewportHeight,
            screenWidth: d.screenWidth || d.viewportWidth,
            screenHeight: d.screenHeight || d.viewportHeight,
            platform: d.platform || '',
          });
        }
      }
      if (candidates.length) {
        return candidates[seed[0] % candidates.length];
      }
    } catch (e) {
      console.warn('[FP] user-agents package failed, using fallback:', e.message);
    }
  }

  const ua = pick(seed, FALLBACK_USER_AGENTS);
  const vp = pick(seed.slice(1), FALLBACK_VIEWPORTS);
  return {
    userAgent: ua,
    viewportWidth: vp.width,
    viewportHeight: vp.height,
    screenWidth: vp.width,
    screenHeight: vp.height + 40,
    platform: /Macintosh/.test(ua) ? 'MacIntel' : /Linux/.test(ua) ? 'Linux x86_64' : 'Win32',
  };
}

/**
 * Build fingerprint profile for a bot / view profile.
 * @param {string} botName - profile or bot name (seed source)
 * @param {{ lowMem?: boolean, browserBrand?: string }} opts
 *   - browserBrand: if provided, use it; otherwise pick stable brand from name
 * CHANGE: opts.browserBrand + brand-aware UA / engine / CH
 */
function buildFingerprint(botName, opts = {}) {
  const seed = hashSeed(botName || 'bot');

  // CHANGE: stable browser brand per profile (or forced via opts)
  const browserBrand =
    opts.browserBrand && BROWSER_BRANDS.includes(opts.browserBrand)
      ? opts.browserBrand
      : pickStableBrowserBrand(botName || 'bot');
  const brandMeta = getBrandMeta(browserBrand);
  const engine = brandMeta.engine;

  // Viewport: prefer dynamic desktop sizes, low-mem override
  const dyn = getDynamicDesktopUA(seed);
  let viewport = {
    width: Math.max(800, Math.min(1920, dyn.viewportWidth || 1366)),
    height: Math.max(600, Math.min(1080, dyn.viewportHeight || 768)),
  };

  if (viewport.height > viewport.width * 0.9) {
    viewport.height = Math.round(viewport.width * (0.56 + (seed[1] % 20) / 100));
  }

  if (opts.lowMem || process.env.LOW_MEMORY === 'true') {
    viewport = { width: 1024, height: 576 };
  }

  // Safari-like prefers Mac platform
  let platKey = 'win';
  if (engine === 'webkit') {
    platKey = 'mac';
  } else {
    const isMac = /Macintosh|Mac OS X/.test(dyn.userAgent || '') || dyn.platform === 'MacIntel';
    const isLinux = (/Linux/.test(dyn.userAgent || '') || dyn.platform === 'Linux x86_64') && !isMac;
    platKey = isMac ? 'mac' : isLinux ? 'linux' : 'win';
    // Mix platforms by seed for chromium/firefox (except forced Safari)
    const forced = ['win', 'mac', 'linux', 'win', 'win'][seed[13] % 5];
    if (engine !== 'webkit') platKey = forced;
  }

  const plat = PLATFORMS[platKey];
  const loc = pick(seed.slice(2), LOCALES);
  const webgl = pick(seed.slice(3), WEBGL);
  const hardwareConcurrency = [4, 6, 8, 12][seed[4] % 4];
  const deviceMemory = [4, 8, 8, 16][seed[5] % 4];
  const colorDepth = 24;
  const maxTouchPoints = 0;
  const deviceScaleFactor = platKey === 'mac' ? [1, 2, 2, 1.5][seed[12] % 4] : [1, 1, 1, 1.25, 1.5][seed[12] % 5];

  const canvasNoise = seed[7] % 256;
  const audioNoise = (seed[8] / 255) * 0.00012;
  const rectNoise = seed[9] % 3;

  // CHANGE: brand-specific UA instead of generic dynamic only
  const ua = buildBrandUserAgent(browserBrand, seed, platKey);

  const chromeMajorMatch = ua.match(/Chrome\/(\d+)/);
  const chromeMajor = chromeMajorMatch ? chromeMajorMatch[1] : '131';
  const ffMajorMatch = ua.match(/Firefox\/(\d+)/);
  const firefoxMajor = ffMajorMatch ? ffMajorMatch[1] : null;

  const screenWidth = dyn.screenWidth || viewport.width;
  const screenHeight =
    dyn.screenHeight && dyn.screenHeight > viewport.height
      ? dyn.screenHeight
      : viewport.height + intFrom(seed, 10, 40, 80);
  const outerWidth = viewport.width;
  const outerHeight = viewport.height + intFrom(seed, 11, 60, 100);

  return {
    botName: botName || 'bot',
    // CHANGE: persist brand + engine so next launch reuses same browser identity
    browserBrand,
    engine,
    channel: brandMeta.channel || null,
    chBrand: brandMeta.chBrand,
    userAgent: ua,
    viewport,
    deviceScaleFactor,
    locale: loc.locale,
    timezoneId: process.env.FP_TIMEZONE || loc.timezoneId,
    languages: loc.languages,
    platform: plat.platform,
    uaPlatform: plat.uaPlatform,
    hardwareConcurrency,
    deviceMemory,
    colorDepth,
    maxTouchPoints,
    webgl,
    colorScheme: seed[6] % 2 === 0 ? 'light' : 'dark',
    canvasNoise,
    audioNoise,
    rectNoise,
    chromeMajor,
    firefoxMajor,
    screen: {
      width: screenWidth,
      height: screenHeight,
      availWidth: screenWidth,
      availHeight: screenHeight - 40,
      colorDepth,
      pixelDepth: colorDepth,
    },
    outerWidth,
    outerHeight,
  };
}

/**
 * Playwright launchPersistentContext / newContext option overrides from fingerprint.
 */
function contextOptionsFromFp(fp) {
  return {
    userAgent: fp.userAgent,
    viewport: fp.viewport,
    locale: fp.locale,
    timezoneId: fp.timezoneId,
    colorScheme: fp.colorScheme,
    deviceScaleFactor: fp.deviceScaleFactor || 1,
    isMobile: false,
    hasTouch: false,
  };
}

/**
 * Extra HTTP headers so Client Hints match the spoofed brand/UA.
 * CHANGE: brand-aware sec-ch-ua
 */
function clientHintHeaders(fp) {
  const major = fp.chromeMajor || '131';
  const brand = fp.chBrand || fp.browserBrand || 'Google Chrome';
  // Firefox / Safari typically do not send Chromium-style CH; still set for chromium engine
  if (fp.engine === 'firefox' || fp.engine === 'webkit') {
    return {};
  }
  return {
    'sec-ch-ua': `"${brand}";v="${major}", "Chromium";v="${major}", "Not_A Brand";v="24"`,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': fp.uaPlatform || '"Windows"',
  };
}

/**
 * Init script – runs before any page JS.
 * Playwright: context.addInitScript(fingerprintInitScript(fp), payload)
 */
function fingerprintInitScript(/* fp ignored – data comes from 2nd arg */) {
  return (fpData) => {
    if (!fpData) return;

    // ---- webdriver ----
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    } catch (_) {}

    window.chrome = window.chrome || { runtime: {}, loadTimes: function () {}, csi: function () {}, app: {} };

    // ---- languages ----
    try {
      Object.defineProperty(navigator, 'languages', {
        get: () => Object.freeze([...(fpData.languages || ['en-US', 'en'])]),
      });
      Object.defineProperty(navigator, 'language', {
        get: () => (fpData.languages && fpData.languages[0]) || 'en-US',
      });
    } catch (_) {}

    // ---- platform / hardware ----
    try {
      Object.defineProperty(navigator, 'platform', { get: () => fpData.platform || 'Win32' });
    } catch (_) {}
    try {
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => fpData.hardwareConcurrency || 8,
      });
    } catch (_) {}
    try {
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => fpData.deviceMemory || 8,
      });
    } catch (_) {}
    try {
      Object.defineProperty(navigator, 'maxTouchPoints', {
        get: () => fpData.maxTouchPoints || 0,
      });
    } catch (_) {}

    // ---- vendor (Safari vs Chrome-ish) ----
    try {
      if (fpData.engine === 'webkit') {
        Object.defineProperty(navigator, 'vendor', { get: () => 'Apple Computer, Inc.' });
      } else if (fpData.engine === 'firefox') {
        Object.defineProperty(navigator, 'vendor', { get: () => '' });
      } else {
        Object.defineProperty(navigator, 'vendor', { get: () => 'Google Inc.' });
      }
    } catch (_) {}

    // ---- WebGL ----
    try {
      const getParam = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (param) {
        if (param === 37445) return (fpData.webgl && fpData.webgl.vendor) || 'Google Inc. (NVIDIA)';
        if (param === 37446) return (fpData.webgl && fpData.webgl.renderer) || 'ANGLE (NVIDIA)';
        return getParam.call(this, param);
      };
      if (typeof WebGL2RenderingContext !== 'undefined') {
        const getParam2 = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = function (param) {
          if (param === 37445) return (fpData.webgl && fpData.webgl.vendor) || 'Google Inc. (NVIDIA)';
          if (param === 37446) return (fpData.webgl && fpData.webgl.renderer) || 'ANGLE (NVIDIA)';
          return getParam2.call(this, param);
        };
      }
    } catch (_) {}

    // ---- Canvas noise (seeded) ----
    try {
      const noise = fpData.canvasNoise || 0;
      const toDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function () {
        const ctx = this.getContext('2d');
        if (ctx && this.width > 0 && this.height > 0) {
          try {
            const img = ctx.getImageData(0, 0, Math.min(8, this.width), 1);
            for (let i = 0; i < img.data.length; i += 4) {
              img.data[i] = (img.data[i] + noise) % 256;
            }
            ctx.putImageData(img, 0, 0);
          } catch (_) {}
        }
        return toDataURL.apply(this, arguments);
      };
    } catch (_) {}

    // ---- Audio noise ----
    try {
      if (typeof OfflineAudioContext !== 'undefined' || typeof webkitOfflineAudioContext !== 'undefined') {
        const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        const orig = Offline.prototype.startRendering;
        Offline.prototype.startRendering = function () {
          return orig.apply(this, arguments).then((buf) => {
            try {
              const ch = buf.getChannelData(0);
              const n = fpData.audioNoise || 0.00001;
              for (let i = 0; i < Math.min(ch.length, 32); i++) ch[i] += n;
            } catch (_) {}
            return buf;
          });
        };
      }
    } catch (_) {}

    // ---- Screen / outer size ----
    try {
      if (fpData.screen) {
        Object.defineProperty(screen, 'width', { get: () => fpData.screen.width });
        Object.defineProperty(screen, 'height', { get: () => fpData.screen.height });
        Object.defineProperty(screen, 'availWidth', { get: () => fpData.screen.availWidth });
        Object.defineProperty(screen, 'availHeight', { get: () => fpData.screen.availHeight });
        Object.defineProperty(screen, 'colorDepth', { get: () => fpData.screen.colorDepth || 24 });
        Object.defineProperty(screen, 'pixelDepth', { get: () => fpData.screen.pixelDepth || 24 });
      }
      if (fpData.outerWidth) {
        Object.defineProperty(window, 'outerWidth', { get: () => fpData.outerWidth });
      }
      if (fpData.outerHeight) {
        Object.defineProperty(window, 'outerHeight', { get: () => fpData.outerHeight });
      }
    } catch (_) {}

    // ---- ClientRects slight noise ----
    try {
      const noisePx = fpData.rectNoise || 0;
      if (noisePx) {
        const orig = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function () {
          const r = orig.call(this);
          return {
            x: r.x + noisePx * 0.1,
            y: r.y,
            width: r.width,
            height: r.height,
            top: r.top,
            right: r.right + noisePx * 0.1,
            bottom: r.bottom,
            left: r.left + noisePx * 0.1,
            toJSON: () => {},
          };
        };
      }
    } catch (_) {}

    // ---- Battery / connection soft stubs ----
    try {
      if (navigator.getBattery) {
        navigator.getBattery = async () => ({
          charging: true,
          chargingTime: 0,
          dischargingTime: Infinity,
          level: 0.85 + ((fpData.canvasNoise || 0) % 10) / 100,
          addEventListener: () => {},
          removeEventListener: () => {},
        });
      }
    } catch (_) {}
    try {
      if (navigator.connection || navigator.mozConnection || navigator.webkitConnection) {
        const fakeConn = {
          effectiveType: '4g',
          rtt: 50 + ((fpData.canvasNoise || 0) % 40),
          downlink: 8 + ((fpData.canvasNoise || 0) % 5),
          saveData: false,
          addEventListener: () => {},
          removeEventListener: () => {},
        };
        try {
          Object.defineProperty(navigator, 'connection', { get: () => fakeConn, configurable: true });
        } catch (_) {}
      }
    } catch (_) {}
  };
}

function logFingerprint(fp) {
  console.log(
    `[FP] ${fp.botName} → brand=${fp.browserBrand || '?'} engine=${fp.engine || '?'} | UA=${(fp.userAgent || '').slice(0, 55)}… | ${fp.viewport.width}x${fp.viewport.height} @${fp.deviceScaleFactor || 1}x | ${fp.locale} ${fp.timezoneId} | cores=${fp.hardwareConcurrency} mem=${fp.deviceMemory} | canvas=${fp.canvasNoise}`
  );
}

/**
 * Serializable payload for addInitScript 2nd argument.
 * CHANGE: include engine so init script can set vendor correctly
 */
function initScriptPayload(fp) {
  return {
    languages: fp.languages,
    platform: fp.platform,
    hardwareConcurrency: fp.hardwareConcurrency,
    deviceMemory: fp.deviceMemory,
    maxTouchPoints: fp.maxTouchPoints,
    webgl: fp.webgl,
    canvasNoise: fp.canvasNoise,
    audioNoise: fp.audioNoise,
    rectNoise: fp.rectNoise,
    screen: fp.screen,
    outerWidth: fp.outerWidth,
    outerHeight: fp.outerHeight,
    engine: fp.engine,
    browserBrand: fp.browserBrand,
  };
}

module.exports = {
  buildFingerprint,
  contextOptionsFromFp,
  fingerprintInitScript,
  logFingerprint,
  clientHintHeaders,
  initScriptPayload,
  // CHANGE: export brand helpers for bot.service
  BROWSER_BRANDS,
  pickStableBrowserBrand,
  getEngineForBrand,
  getBrandMeta,
};
