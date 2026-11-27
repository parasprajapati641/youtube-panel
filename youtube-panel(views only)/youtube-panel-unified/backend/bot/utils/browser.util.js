'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const playwright = require('playwright');
const proxyPool = require('./proxyPool.util');
const fpUtil = require('./fingerprint.util');

function findChromePath() {
  return findBrowserPath();
}

function findBrowserPath() {
  const envPaths = [
    process.env.BRAVE_PATH,
    process.env.BROWSER_PATH,
    process.env.CHROME_PATH,
  ].filter(Boolean);

  for (const p of envPaths) {
    if (p && fs.existsSync(p)) {
      console.log('[BROWSER] Using path from env:', p);
      return p;
    }
  }

  const preferBrave = process.env.USE_BRAVE !== 'false';
  const platform = os.platform();
  const braveCandidates = [];
  const chromeCandidates = [];

  if (platform === 'win32') {
    const localApp = process.env.LOCALAPPDATA || '';
    const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';

    braveCandidates.push(
      path.join(localApp, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      path.join(programFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      path.join(programFilesX86, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')
    );

    chromeCandidates.push(
      path.join(localApp, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe')
    );
  } else if (platform === 'darwin') {
    braveCandidates.push('/Applications/Brave Browser.app/Contents/MacOS/Brave Browser');
    chromeCandidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    );
  } else {
    braveCandidates.push('/usr/bin/brave-browser', '/usr/bin/brave', '/snap/bin/brave');
    chromeCandidates.push(
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/snap/bin/chromium'
    );
  }

  const tryList = preferBrave
    ? [...braveCandidates, ...chromeCandidates]
    : [...chromeCandidates, ...braveCandidates];

  for (const p of tryList) {
    if (p && fs.existsSync(p)) {
      const name = /brave/i.test(p) ? 'Brave' : 'Chrome';
      console.log('[BROWSER] Found ' + name + ':', p);
      return p;
    }
  }

  return null;
}

function vmwareArgs(customViewport = null) {
  const isVm =
    process.env.VMWARE === 'true' ||
    process.env.VM === 'true' ||
    process.env.RUNNING_IN_VM === 'true';

  const lowMem =
    process.env.LOW_MEMORY === 'true' ||
    process.env.LOW_RAM === 'true' ||
    isVm;

  const width = customViewport?.width || parseInt(process.env.VIEWPORT_W || (lowMem ? '1024' : '1366'), 10);
  const height = customViewport?.height || parseInt(process.env.VIEWPORT_H || (lowMem ? '576' : '768'), 10);

  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    '--disk-cache-size=1048576',
    '--media-cache-size=1048576',
    '--aggressive-cache-discard',
    '--disable-infobars',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=' + width + ',' + height,
    '--disable-features=TranslateUI,BlinkGenPropertyTrees,IsolateOrigins',
  ];

  if (isVm || lowMem) {
    args.push(
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-domain-reliability',
      '--disable-hang-monitor',
      '--disable-ipc-flooding-protection',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-sync',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-pings',
      '--no-zygote',
      '--single-process',
      '--memory-pressure-off',
      '--force-color-profile=srgb'
    );
  }

  if (process.env.SINGLE_PROCESS === 'false') {
    const idx = args.indexOf('--single-process');
    if (idx >= 0) args.splice(idx, 1);
  }

  const headed =
    process.env.HEADLESS === 'false' ||
    process.env.HEADED === 'true' ||
    process.env.VISIBLE_BROWSER === 'true';

  if (headed) {
    const kill = new Set([
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--single-process',
      '--in-process-gpu',
      '--no-zygote',
      '--renderer-process-limit=1',
      '--mute-audio',
    ]);
    const filtered = args.filter((a) => !kill.has(a) && !String(a).startsWith('--js-flags='));
    filtered.push('--use-gl=angle');
    filtered.push('--enable-gpu-rasterization');
    return { isVm, lowMem: false, width, height, args: filtered };
  }

  return { isVm, lowMem, width, height, args };
}

async function launchStealthProfile(profileName, options = {}) {
  const useProxy = options.useProxy !== false;
  const headless = options.headless !== undefined ? options.headless : process.env.HEADLESS !== 'false';
  const maxRetries = options.maxRetries || 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let proxyObj = null;

    if (useProxy) {
      if (proxyPool.proxies.length === 0) {
        await proxyPool.scrapeAndHarvest(options.harvestTarget || 300, 120);
      }
      proxyObj = proxyPool.getProxyForProfile(profileName + (attempt > 1 ? `_retry${attempt}` : ''));
    }

    const fp = fpUtil.buildFingerprint(profileName, { proxyGeo: proxyObj });
    fpUtil.logFingerprint(fp);

    const profilesBaseDir = path.join(__dirname, '..', '..', 'profiles');
    const userDataDir = path.join(profilesBaseDir, profileName);
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

    const vmConfig = vmwareArgs(fp.viewport);
    const engineType = playwright[fp.engine] || playwright.chromium;

    const launchOptions = {
      ...fpUtil.contextOptionsFromFp(fp),
      headless,
      extraHTTPHeaders: fpUtil.clientHintHeaders(fp),
    };

    if (fp.engine === 'chromium') {
      const execPath = findBrowserPath();
      if (execPath) launchOptions.executablePath = execPath;
      launchOptions.args = vmConfig.args;
      launchOptions.ignoreDefaultArgs = ['--enable-automation'];
    }

    if (proxyObj) {
      launchOptions.proxy = { server: proxyObj.server };
    }

    let context = null;
    try {
      context = await engineType.launchPersistentContext(userDataDir, launchOptions);
      await context.addInitScript(fpUtil.fingerprintInitScript(), fpUtil.initScriptPayload(fp));

      const page = context.pages()[0] || (await context.newPage());
      return {
        context,
        page,
        fp,
        proxyObj,
        simulateHuman: () => fpUtil.simulateHumanBehavior(page, profileName),
        markProxyDead: () => {
          if (proxyObj) proxyPool.markDead(proxyObj.server);
        },
      };
    } catch (err) {
      if (context) await context.close().catch(() => {});
      if (proxyObj) proxyPool.markDead(proxyObj.server);
      if (attempt === maxRetries) throw err;
    }
  }
}

module.exports = {
  findChromePath,
  findBrowserPath,
  vmwareArgs,
  launchStealthProfile,
};