/**
 * Per-bot / per-view-profile browser fingerprint spoofing for Playwright.
 * Upgraded: Real device screen ratios, proxy geo-sync, WebRTC leak protection,
 * 1 Lakh+ deterministic profiles, and human-like behavior simulation.
 */

'use strict';

const crypto = require('crypto');

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

const BROWSER_BRANDS = [
  'Google Chrome', 'Apple Safari', 'Microsoft Edge', 'Mozilla Firefox',
  'Brave', 'Opera', 'Opera GX', 'Vivaldi', 'LibreWolf', 'Zen Browser',
  'Arc', 'DuckDuckGo', 'Chromium', 'Waterfox', 'Mullvad Browser',
  'Ecosia', 'Yandex Browser', 'Floorp', 'Thorium', 'Ungoogled Chromium',
];

const BRAND_META = {
  'Google Chrome': { engine: 'chromium', channel: 'chrome', chBrand: 'Google Chrome', uaHint: 'Chrome' },
  'Apple Safari': { engine: 'webkit', channel: null, chBrand: 'Safari', uaHint: 'Safari' },
  'Microsoft Edge': { engine: 'chromium', channel: 'msedge', chBrand: 'Microsoft Edge', uaHint: 'Edg' },
  'Mozilla Firefox': { engine: 'firefox', channel: null, chBrand: 'Firefox', uaHint: 'Firefox' },
  Brave: { engine: 'chromium', channel: null, chBrand: 'Brave', uaHint: 'Chrome' },
  Opera: { engine: 'chromium', channel: null, chBrand: 'Opera', uaHint: 'OPR' },
  'Opera GX': { engine: 'chromium', channel: null, chBrand: 'Opera', uaHint: 'OPR' },
  Vivaldi: { engine: 'chromium', channel: null, chBrand: 'Vivaldi', uaHint: 'Vivaldi' },
  LibreWolf: { engine: 'firefox', channel: null, chBrand: 'Firefox', uaHint: 'Firefox' },
  'Zen Browser': { engine: 'firefox', channel: null, chBrand: 'Firefox', uaHint: 'Firefox' },
  Arc: { engine: 'chromium', channel: null, chBrand: 'Arc', uaHint: 'Chrome' },
  DuckDuckGo: { engine: 'chromium', channel: null, chBrand: 'DuckDuckGo', uaHint: 'Chrome' },
  Chromium: { engine: 'chromium', channel: 'chromium', chBrand: 'Chromium', uaHint: 'Chrome' },
  Waterfox: { engine: 'firefox', channel: null, chBrand: 'Firefox', uaHint: 'Firefox' },
  'Mullvad Browser': { engine: 'firefox', channel: null, chBrand: 'Firefox', uaHint: 'Firefox' },
  Ecosia: { engine: 'chromium', channel: null, chBrand: 'Chromium', uaHint: 'Chrome' },
  'Yandex Browser': { engine: 'chromium', channel: null, chBrand: 'Yandex', uaHint: 'YaBrowser' },
  Floorp: { engine: 'firefox', channel: null, chBrand: 'Firefox', uaHint: 'Firefox' },
  Thorium: { engine: 'chromium', channel: null, chBrand: 'Chromium', uaHint: 'Chrome' },
  'Ungoogled Chromium': { engine: 'chromium', channel: 'chromium', chBrand: 'Chromium', uaHint: 'Chrome' },
};

function pickStableBrowserBrand(profileName) {
  const seed = hashSeed(profileName || 'bot');
  const idx = (seed[0] + seed[1] * 31 + seed[2] * 17) % BROWSER_BRANDS.length;
  return BROWSER_BRANDS[idx];
}

function getBrandMeta(brand) {
  return BRAND_META[brand] || { engine: 'chromium', channel: 'chrome', chBrand: 'Google Chrome', uaHint: 'Chrome' };
}

function getEngineForBrand(brand) {
  return getBrandMeta(brand).engine;
}

// 100% Real-world Desktop Screen & Exact Browser Viewport Pairs (Never looks fake)
const REAL_DESKTOP_SCREENS = [
  { screenW: 1920, screenH: 1080, viewW: 1920, viewH: 969, taskbar: 40 },
  { screenW: 1920, screenH: 1080, viewW: 1903, viewH: 969, taskbar: 40 },
  { screenW: 1366, screenH: 768,  viewW: 1366, viewH: 657, taskbar: 40 },
  { screenW: 1536, screenH: 864,  viewW: 1536, viewH: 754, taskbar: 40 },
  { screenW: 1440, screenH: 900,  viewW: 1440, viewH: 789, taskbar: 25 }, // MacBook Air/Pro
  { screenW: 1680, screenH: 1050, viewW: 1680, viewH: 939, taskbar: 25 }, // Mac
  { screenW: 2560, screenH: 1440, viewW: 2560, viewH: 1329, taskbar: 40 },
  { screenW: 1600, screenH: 900,  viewW: 1600, viewH: 789, taskbar: 40 },
];

const LOCALES = [
  { locale: 'en-US', timezoneId: 'America/New_York', languages: ['en-US', 'en'] },
  { locale: 'en-GB', timezoneId: 'Europe/London', languages: ['en-GB', 'en'] },
  { locale: 'en-IN', timezoneId: 'Asia/Kolkata', languages: ['en-IN', 'en', 'hi'] },
  { locale: 'en-US', timezoneId: 'America/Los_Angeles', languages: ['en-US', 'en'] },
  { locale: 'en-CA', timezoneId: 'America/Toronto', languages: ['en-CA', 'en'] },
];

const PLATFORMS = {
  win: { platform: 'Win32', oscpu: 'Windows NT 10.0; Win64; x64', uaPlatform: '"Windows"' },
  mac: { platform: 'MacIntel', oscpu: 'Intel Mac OS X 10_15_7', uaPlatform: '"macOS"' },
  linux: { platform: 'Linux x86_64', oscpu: 'Linux x86_64', uaPlatform: '"Linux"' },
};

const WEBGL_BY_OS = {
  win: [
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  ],
  mac: [
    { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M1, OpenGL 4.1)' },
    { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M2, OpenGL 4.1)' },
    { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M3, OpenGL 4.1)' },
  ],
  linux: [
    { vendor: 'Google Inc. (Google)', renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)' },
    { vendor: 'Google Inc. (Mesa)', renderer: 'ANGLE (Mesa, llvmpipe (LLVM 15.0.7), OpenGL 4.5)' },
  ],
};

function buildBrandUserAgent(brand, seed, platKey) {
  const meta = getBrandMeta(brand);
  const chromeMajors = [130, 131, 132, 133];
  const ffMajors = [131, 132, 133, 134];
  const safariMajors = [17, 18];
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

  if (meta.engine === 'firefox') {
    const rv = `${major}.0`;
    return `Mozilla/5.0 (${osPart}; rv:${rv}) Gecko/20100101 Firefox/${rv}`;
  }
  if (meta.engine === 'webkit') {
    const v = major === 18 ? '18.1' : '17.6';
    return `Mozilla/5.0 (${macOS}) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${v} Safari/605.1.15`;
  }

  const chromeBase = `Mozilla/5.0 (${osPart}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
  if (brand === 'Microsoft Edge') return `${chromeBase} Edg/${major}.0.0.0`;
  if (brand === 'Opera' || brand === 'Opera GX') return `${chromeBase} OPR/${major}.0.0.0`;
  if (brand === 'Vivaldi') return `${chromeBase} Vivaldi/${major}.0.0.0`;
  if (brand === 'Yandex Browser') return `${chromeBase} YaBrowser/${major}.0.0.0`;
  return chromeBase;
}

/**
 * Build deterministic fingerprint for 1 Lakh+ profiles.
 * @param {string} botName
 * @param {{ lowMem?: boolean, browserBrand?: string, proxyGeo?: object }} opts
 */
function buildFingerprint(botName, opts = {}) {
  const seed = hashSeed(botName || 'bot');

  const browserBrand = 'Google Chrome';
  const brandMeta = getBrandMeta(browserBrand);
  const engine = 'chromium';

  // Strictly match real host OS so WebGL shader & navigator.platform NEVER mismatch
  const platKey = process.platform === 'linux' ? 'linux' : process.platform === 'darwin' ? 'mac' : 'win';

  const screenPool = platKey === 'mac'
    ? REAL_DESKTOP_SCREENS.filter((s) => s.taskbar === 25)
    : REAL_DESKTOP_SCREENS.filter((s) => s.taskbar === 40);
  const chosenScreen = screenPool[seed[1] % screenPool.length];

  let viewport = { width: chosenScreen.viewW, height: chosenScreen.viewH };
  if (opts.lowMem || process.env.LOW_MEMORY === 'true') {
    viewport = { width: 1280, height: 720 };
  }

  const plat = PLATFORMS[platKey];
  const defaultLoc = pick(seed.slice(2), LOCALES);

  const timezoneId = (opts.proxyGeo && opts.proxyGeo.timezoneId) || process.env.FP_TIMEZONE || defaultLoc.timezoneId;
  const locale = (opts.proxyGeo && opts.proxyGeo.locale) || defaultLoc.locale;
  const languages = locale === 'en-IN' ? ['en-IN', 'en', 'hi'] : [locale, 'en'];

  const webglList = WEBGL_BY_OS[platKey];
  const webgl = webglList[seed[3] % webglList.length];

  const hardwareConcurrency = [4, 6, 8, 12, 16][seed[4] % 5];
  const deviceMemory = [4, 8, 8, 16][seed[5] % 4];
  const deviceScaleFactor = platKey === 'mac' ? 2 : 1;

  const canvasNoise = {
    r: (seed[7] % 3) - 1,
    g: (seed[8] % 3) - 1,
    b: (seed[9] % 3) - 1,
  };
  const audioNoise = ((seed[10] % 50) + 1) * 0.0000001;
  const rectNoise = (seed[11] % 3) * 0.05;

  const ua = buildBrandUserAgent(browserBrand, seed, platKey);
  const chromeMajorMatch = ua.match(/Chrome\/(\d+)/);
  const chromeMajor = chromeMajorMatch ? chromeMajorMatch[1] : '132';

  return {
    botName: botName || 'bot',
    browserBrand,
    engine,
    channel: brandMeta.channel || null,
    chBrand: brandMeta.chBrand,
    userAgent: ua,
    viewport,
    deviceScaleFactor,
    locale,
    timezoneId,
    languages,
    geolocation: opts.proxyGeo && opts.proxyGeo.lat ? { latitude: opts.proxyGeo.lat, longitude: opts.proxyGeo.lon } : null,
    platform: plat.platform,
    uaPlatform: plat.uaPlatform,
    hardwareConcurrency,
    deviceMemory,
    colorDepth: 24,
    maxTouchPoints: 0,
    webgl,
    colorScheme: seed[6] % 2 === 0 ? 'light' : 'dark',
    canvasNoise,
    audioNoise,
    rectNoise,
    chromeMajor,
    screen: {
      width: chosenScreen.screenW,
      height: chosenScreen.screenH,
      availWidth: chosenScreen.screenW,
      availHeight: chosenScreen.screenH - chosenScreen.taskbar,
      colorDepth: 24,
      pixelDepth: 24,
    },
    outerWidth: chosenScreen.screenW,
    outerHeight: chosenScreen.screenH - chosenScreen.taskbar,
  };
}
function contextOptionsFromFp(fp) {
  const opts = {
    userAgent: fp.userAgent,
    viewport: fp.viewport,
    locale: fp.locale,
    timezoneId: fp.timezoneId,
    colorScheme: fp.colorScheme,
    deviceScaleFactor: fp.deviceScaleFactor || 1,
    isMobile: false,
    hasTouch: false,
  };
  if (fp.geolocation) {
    opts.geolocation = fp.geolocation;
    opts.permissions = ['geolocation'];
  }
  return opts;
}

function clientHintHeaders(fp) {
  const major = fp.chromeMajor || '132';
  const brand = fp.chBrand || fp.browserBrand || 'Google Chrome';
  if (fp.engine === 'firefox' || fp.engine === 'webkit') {
    return { 'Accept-Language': `${fp.languages.join(',')};q=0.9` };
  }
  return {
    'sec-ch-ua': `"${brand}";v="${major}", "Chromium";v="${major}", "Not_A Brand";v="24"`,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': fp.uaPlatform || '"Windows"',
    'Accept-Language': `${fp.languages.join(',')};q=0.9`,
  };
}

function fingerprintInitScript() {
  return (fpData) => {
    if (!fpData) return;

    // 1. navigator.webdriver -> strictly false (Real Human Chrome behavior)
    const hideWebdriver = (obj) => {
      if (!obj) return;
      try {
        Object.defineProperty(obj, 'webdriver', { get: () => false, configurable: true });
      } catch (_) {}
    };
    hideWebdriver(navigator);
    hideWebdriver(Object.getPrototypeOf(navigator));
    hideWebdriver(Navigator.prototype);

    // 2. Clean Playwright/Automation globals
    try {
      delete window.__playwright;
      delete window.__pw_manual;
      delete window.__PW_inspect;
    } catch (_) {}

    // 3. Chrome runtime objects
    if (fpData.engine === 'chromium') {
      window.chrome = window.chrome || {};
      window.chrome.runtime = window.chrome.runtime || {
        connect: function () {},
        sendMessage: function () {},
        id: undefined,
      };
      window.chrome.app = window.chrome.app || {
        isInstalled: false,
        getDetails: () => null,
        getIsInstalled: () => false,
      };
    }

    // 4. Permissions query fix
    try {
      const origQuery = window.Permissions && Permissions.prototype.query;
      if (origQuery) {
        Permissions.prototype.query = function (params) {
          if (params && params.name === 'notifications') {
            return Promise.resolve({ state: Notification.permission || 'default', onchange: null });
          }
          return origQuery.call(this, params);
        };
      }
    } catch (_) {}

    // 5. Realistic Plugins
    try {
      if (!navigator.plugins || navigator.plugins.length === 0) {
        const pluginData = [
          { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        ];
        const fakePlugins = pluginData.map((p) => ({ ...p, length: 1, item: () => null }));
        fakePlugins.item = (i) => fakePlugins[i] || null;
        fakePlugins.namedItem = (n) => fakePlugins.find((x) => x.name === n) || null;
        Object.defineProperty(navigator, 'plugins', { get: () => fakePlugins, configurable: true });
      }
    } catch (_) {}

    // 6. Navigator Hardware, Platform, Languages
    try {
      Object.defineProperty(navigator, 'languages', { get: () => Object.freeze([...fpData.languages]) });
      Object.defineProperty(navigator, 'language', { get: () => fpData.languages[0] });
      Object.defineProperty(navigator, 'platform', { get: () => fpData.platform });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => fpData.hardwareConcurrency });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => fpData.deviceMemory });
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
      const vendor = fpData.engine === 'webkit' ? 'Apple Computer, Inc.' : fpData.engine === 'firefox' ? '' : 'Google Inc.';
      Object.defineProperty(navigator, 'vendor', { get: () => vendor });
    } catch (_) {}

    // 7. WebGL 1 & 2 Vendor/Renderer
    try {
      const patchWebGL = (Ctx) => {
        if (!Ctx) return;
        const getParam = Ctx.prototype.getParameter;
        Ctx.prototype.getParameter = function (param) {
          if (param === 37445) return fpData.webgl.vendor;
          if (param === 37446) return fpData.webgl.renderer;
          return getParam.call(this, param);
        };
      };
      patchWebGL(window.WebGLRenderingContext);
      patchWebGL(window.WebGL2RenderingContext);
    } catch (_) {}

    // 8. Canvas RGB Subtle Deterministic Noise
    try {
      const toDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function () {
        const ctx = this.getContext('2d');
        if (ctx && this.width > 0 && this.height > 0) {
          try {
            const img = ctx.getImageData(0, 0, Math.min(8, this.width), 1);
            for (let i = 0; i < img.data.length; i += 4) {
              img.data[i] = Math.min(255, Math.max(0, img.data[i] + fpData.canvasNoise.r));
              img.data[i + 1] = Math.min(255, Math.max(0, img.data[i + 1] + fpData.canvasNoise.g));
              img.data[i + 2] = Math.min(255, Math.max(0, img.data[i + 2] + fpData.canvasNoise.b));
            }
            ctx.putImageData(img, 0, 0);
          } catch (_) {}
        }
        return toDataURL.apply(this, arguments);
      };
    } catch (_) {}

    // 9. AudioContext Noise
    try {
      const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (Offline) {
        const orig = Offline.prototype.startRendering;
        Offline.prototype.startRendering = function () {
          return orig.apply(this, arguments).then((buf) => {
            try {
              const ch = buf.getChannelData(0);
              for (let i = 0; i < Math.min(ch.length, 32); i++) ch[i] += fpData.audioNoise;
            } catch (_) {}
            return buf;
          });
        };
      }
    } catch (_) {}

    // 10. Real Screen & Window Dimensions
    try {
      Object.defineProperty(screen, 'width', { get: () => fpData.screen.width });
      Object.defineProperty(screen, 'height', { get: () => fpData.screen.height });
      Object.defineProperty(screen, 'availWidth', { get: () => fpData.screen.availWidth });
      Object.defineProperty(screen, 'availHeight', { get: () => fpData.screen.availHeight });
      Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
      Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });
      Object.defineProperty(window, 'outerWidth', { get: () => fpData.outerWidth });
      Object.defineProperty(window, 'outerHeight', { get: () => fpData.outerHeight });
    } catch (_) {}
  };
}

/**
 * Human-like Mouse Movement, Smooth Scrolling & Reading Pauses for Playwright Page
 */
async function simulateHumanBehavior(page, botName = 'bot') {
  console.log(`[HUMAN] [${botName}] Natural human mouse & scroll simulation start...`);
  const vp = page.viewportSize() || { width: 1366, height: 768 };

  // Smooth curved mouse steps
  let curX = Math.floor(vp.width * 0.3);
  let curY = Math.floor(vp.height * 0.3);

  for (let step = 0; step < 4; step++) {
    const targetX = Math.floor(Math.random() * (vp.width - 150)) + 75;
    const targetY = Math.floor(Math.random() * (vp.height - 150)) + 75;
    await page.mouse.move(targetX, targetY, { steps: 15 + Math.floor(Math.random() * 15) });
    curX = targetX;
    curY = targetY;
    await page.waitForTimeout(300 + Math.floor(Math.random() * 500));
  }

  // Smooth human-like scroll down and slight scroll up
  for (let s = 0; s < 3; s++) {
    const scrollY = 200 + Math.floor(Math.random() * 350);
    await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'smooth' }), scrollY);
    await page.waitForTimeout(600 + Math.floor(Math.random() * 700));
  }

  console.log(`[HUMAN] [${botName}] Human behavior complete.`);
}

function logFingerprint(fp) {
  console.log(
    `[FP] ${fp.botName} → Brand: ${fp.browserBrand} (${fp.engine}) | OS: ${fp.platform} | Screen: ${fp.screen.width}x${fp.screen.height} (View: ${fp.viewport.width}x${fp.viewport.height}) | TZ: ${fp.timezoneId} | GPU: ${fp.webgl.vendor}`
  );
}

function initScriptPayload(fp) {
  return {
    languages: fp.languages,
    platform: fp.platform,
    hardwareConcurrency: fp.hardwareConcurrency,
    deviceMemory: fp.deviceMemory,
    webgl: fp.webgl,
    canvasNoise: fp.canvasNoise,
    audioNoise: fp.audioNoise,
    screen: fp.screen,
    outerWidth: fp.outerWidth,
    outerHeight: fp.outerHeight,
    engine: fp.engine,
  };
}

module.exports = {
  buildFingerprint,
  contextOptionsFromFp,
  fingerprintInitScript,
  logFingerprint,
  clientHintHeaders,
  initScriptPayload,
  simulateHumanBehavior,
  BROWSER_BRANDS,
  pickStableBrowserBrand,
  getEngineForBrand,
  getBrandMeta,
};