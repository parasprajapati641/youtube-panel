/**
 * Per-bot browser fingerprint spoofing for Playwright.
 * Same botName → stable fingerprint; different bots → different FP.
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
 * Get a realistic desktop User-Agent + matching viewport from `user-agents` package.
 * Falls back to hard-coded lists if package is unavailable.
 * Uses bot seed so the same bot gets a consistent-ish choice across runs.
 */
function getDynamicDesktopUA(seed) {
  if (UserAgent) {
    try {
      // Generate a few candidates and pick by seed for relative stability
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

  // Fallback
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
 * Build fingerprint profile for a bot.
 * @param {string} botName
 * @param {{ lowMem?: boolean }} opts
 */
function buildFingerprint(botName, opts = {}) {
  const seed = hashSeed(botName || 'bot');

  // Dynamic UA + matching viewport from user-agents (desktop only)
  const dyn = getDynamicDesktopUA(seed);
  let ua = dyn.userAgent;
  let viewport = {
    width: Math.max(800, Math.min(1920, dyn.viewportWidth || 1366)),
    height: Math.max(600, Math.min(1080, dyn.viewportHeight || 768)),
  };

  // Sanity: some data sets return square viewports – clamp to realistic desktop ratios
  if (viewport.height > viewport.width * 0.9) {
    viewport.height = Math.round(viewport.width * (0.56 + (seed[1] % 20) / 100)); // ~16:9-ish
  }

  if (opts.lowMem || process.env.LOW_MEMORY === 'true') {
    viewport = { width: 1024, height: 576 };
  }

  const loc = pick(seed.slice(2), LOCALES);
  const isMac = /Macintosh|Mac OS X/.test(ua) || dyn.platform === 'MacIntel';
  const isLinux = (/Linux/.test(ua) || dyn.platform === 'Linux x86_64') && !isMac;
  const plat = isMac ? PLATFORMS.mac : isLinux ? PLATFORMS.linux : PLATFORMS.win;
  const webgl = pick(seed.slice(3), WEBGL);
  const hardwareConcurrency = [4, 6, 8, 12][seed[4] % 4];
  const deviceMemory = [4, 8, 8, 16][seed[5] % 4];
  const colorDepth = 24;
  const maxTouchPoints = 0;

  // deviceScaleFactor (Retina-ish or standard). Desktop usually 1 or 1.25/1.5
  const deviceScaleFactor = [1, 1, 1, 1.25, 1.5][seed[12] % 5];

  // Stable noise seeds (0–255 / float) – same bot = same noise every run
  const canvasNoise = seed[7] % 256;
  const audioNoise = (seed[8] / 255) * 0.00012;
  const rectNoise = (seed[9] % 3); // 0, 1, or 2 px drift on rects

  // Chrome major from UA for Client Hints
  const chromeMajorMatch = ua.match(/Chrome\/(\d+)/);
  const chromeMajor = chromeMajorMatch ? chromeMajorMatch[1] : '131';

  // Screen slightly larger than viewport (taskbar / chrome UI)
  const screenWidth = dyn.screenWidth || viewport.width;
  const screenHeight = (dyn.screenHeight && dyn.screenHeight > viewport.height)
    ? dyn.screenHeight
    : viewport.height + intFrom(seed, 10, 40, 80);
  const outerWidth = viewport.width;
  const outerHeight = viewport.height + intFrom(seed, 11, 60, 100);

  return {
    botName: botName || 'bot',
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
 * Playwright launchPersistentContext option overrides from fingerprint.
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
 * Extra HTTP headers so Client Hints match the spoofed UA (Level 1).
 * Apply via context.setExtraHTTPHeaders after launch if desired.
 */
function clientHintHeaders(fp) {
  const major = fp.chromeMajor || '131';
  return {
    'sec-ch-ua': `"Google Chrome";v="${major}", "Chromium";v="${major}", "Not_A Brand";v="24"`,
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

    // ---- plugins ----
    try {
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const fake = [
            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
            { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
          ];
          fake.item = (i) => fake[i] || null;
          fake.namedItem = (n) => fake.find((x) => x.name === n) || null;
          fake.refresh = () => {};
          return fake;
        },
      });
    } catch (_) {}

    // ---- screen ----
    try {
      const s = fpData.screen || {};
      const screenProps = {
        width: s.width || 1366,
        height: s.height || 768,
        availWidth: s.availWidth || s.width || 1366,
        availHeight: s.availHeight || (s.height || 768) - 40,
        colorDepth: s.colorDepth || 24,
        pixelDepth: s.pixelDepth || 24,
      };
      for (const [k, v] of Object.entries(screenProps)) {
        try {
          Object.defineProperty(screen, k, { get: () => v, configurable: true });
        } catch (_) {}
      }
    } catch (_) {}

    // ---- window outer size (match spoofed chrome UI) ----
    try {
      if (fpData.outerWidth) {
        Object.defineProperty(window, 'outerWidth', { get: () => fpData.outerWidth, configurable: true });
      }
      if (fpData.outerHeight) {
        Object.defineProperty(window, 'outerHeight', { get: () => fpData.outerHeight, configurable: true });
      }
    } catch (_) {}

    // ---- WebGL vendor/renderer ----
    try {
      const patch = (proto) => {
        if (!proto || !proto.getParameter) return;
        const original = proto.getParameter;
        proto.getParameter = function (param) {
          if (param === 37445) return (fpData.webgl && fpData.webgl.vendor) || original.call(this, param);
          if (param === 37446) return (fpData.webgl && fpData.webgl.renderer) || original.call(this, param);
          return original.call(this, param);
        };
      };
      if (typeof WebGLRenderingContext !== 'undefined') patch(WebGLRenderingContext.prototype);
      if (typeof WebGL2RenderingContext !== 'undefined') patch(WebGL2RenderingContext.prototype);
    } catch (_) {}

    // ---- Canvas noise (stable per bot, light) ----
    try {
      const noise = (fpData.canvasNoise | 0) % 256;
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      const origToBlob = HTMLCanvasElement.prototype.toBlob;
      const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;

      const applyNoise = (canvas) => {
        try {
          const ctx = canvas.getContext('2d');
          if (!ctx || canvas.width < 1 || canvas.height < 1) return;
          const w = Math.min(canvas.width, 8);
          const h = Math.min(canvas.height, 8);
          const img = ctx.getImageData(0, 0, w, h);
          for (let i = 0; i < img.data.length; i += 4) {
            img.data[i] = (img.data[i] + noise) % 256;
          }
          ctx.putImageData(img, 0, 0);
        } catch (_) {}
      };

      HTMLCanvasElement.prototype.toDataURL = function () {
        applyNoise(this);
        return origToDataURL.apply(this, arguments);
      };
      HTMLCanvasElement.prototype.toBlob = function () {
        applyNoise(this);
        return origToBlob.apply(this, arguments);
      };
      CanvasRenderingContext2D.prototype.getImageData = function () {
        const data = origGetImageData.apply(this, arguments);
        try {
          if (data && data.data && data.data.length) {
            data.data[0] = (data.data[0] + noise) % 256;
          }
        } catch (_) {}
        return data;
      };
    } catch (_) {}

    // ---- AudioContext noise ----
    try {
      const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (Offline && Offline.prototype.startRendering) {
        const orig = Offline.prototype.startRendering;
        const aNoise = typeof fpData.audioNoise === 'number' ? fpData.audioNoise : 0.00005;
        Offline.prototype.startRendering = function () {
          return orig.apply(this, arguments).then((buffer) => {
            try {
              const ch = buffer.getChannelData(0);
              if (ch && ch.length > 0) ch[0] = (ch[0] || 0) + aNoise;
            } catch (_) {}
            return buffer;
          });
        };
      }
    } catch (_) {}

    // ---- ClientRects slight noise (stable) ----
    try {
      const rNoise = (fpData.rectNoise | 0) % 3;
      if (rNoise > 0) {
        const patchRect = (proto, method) => {
          if (!proto || !proto[method]) return;
          const orig = proto[method];
          proto[method] = function () {
            const r = orig.apply(this, arguments);
            if (!r) return r;
            try {
              const o = {
                x: r.x + rNoise * 0.01,
                y: r.y,
                width: r.width,
                height: r.height,
                top: r.top,
                right: r.right + rNoise * 0.01,
                bottom: r.bottom,
                left: r.left + rNoise * 0.01,
              };
              o.toJSON = () => o;
              return o;
            } catch (_) {
              return r;
            }
          };
        };
        patchRect(Element.prototype, 'getBoundingClientRect');
        if (Range && Range.prototype) patchRect(Range.prototype, 'getBoundingClientRect');
      }
    } catch (_) {}

    // ---- Permissions (notifications) ----
    try {
      const origQuery = navigator.permissions && navigator.permissions.query;
      if (origQuery) {
        navigator.permissions.query = function (desc) {
          if (desc && desc.name === 'notifications') {
            return Promise.resolve({ state: 'prompt', onchange: null });
          }
          return origQuery.apply(this, arguments).catch(() => ({ state: 'prompt', onchange: null }));
        };
      }
    } catch (_) {}

    // ---- Battery (hide real device signal) ----
    try {
      if (navigator.getBattery) {
        navigator.getBattery = function () {
          return Promise.resolve({
            charging: true,
            chargingTime: 0,
            dischargingTime: Infinity,
            level: 0.85 + ((fpData.canvasNoise || 0) % 10) / 100,
            addEventListener: function () {},
            removeEventListener: function () {},
            onchargingchange: null,
            onlevelchange: null,
          });
        };
      }
    } catch (_) {}

    // ---- connection (optional soft values) ----
    try {
      if (navigator.connection || navigator.mozConnection || navigator.webkitConnection) {
        const fakeConn = {
          effectiveType: '4g',
          rtt: 50 + ((fpData.canvasNoise || 0) % 40),
          downlink: 8 + ((fpData.canvasNoise || 0) % 5),
          saveData: false,
          addEventListener: function () {},
          removeEventListener: function () {},
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
    `[FP] ${fp.botName} → UA=${fp.userAgent.slice(0, 50)}… | ${fp.viewport.width}x${fp.viewport.height} @${fp.deviceScaleFactor || 1}x | ${fp.locale} ${fp.timezoneId} | cores=${fp.hardwareConcurrency} mem=${fp.deviceMemory} | canvas=${fp.canvasNoise}`
  );
}

/**
 * Serializable payload for addInitScript 2nd argument.
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
  };
}

module.exports = {
  buildFingerprint,
  contextOptionsFromFp,
  fingerprintInitScript,
  logFingerprint,
  clientHintHeaders,
  initScriptPayload,
};
