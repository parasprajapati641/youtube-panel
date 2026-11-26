const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Find browser executable for Playwright.
 * Priority:
 *   1) BRAVE_PATH / CHROME_PATH / BROWSER_PATH env (if file exists)
 *   2) Brave (default when USE_BRAVE !== 'false')
 *   3) Google Chrome
 *   4) null → Playwright bundled Chromium
 */
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
    braveCandidates.push(
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
    );
    chromeCandidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    );
  } else {
    braveCandidates.push(
      '/usr/bin/brave-browser',
      '/usr/bin/brave',
      '/snap/bin/brave'
    );
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

/**
 * Chromium args for VMware + low-memory VMs.
 */
function vmwareArgs() {
  const isVm =
    process.env.VMWARE === 'true' ||
    process.env.VM === 'true' ||
    process.env.RUNNING_IN_VM === 'true';

  const lowMem =
    process.env.LOW_MEMORY === 'true' ||
    process.env.LOW_RAM === 'true' ||
    isVm;

  const width = parseInt(process.env.VIEWPORT_W || (lowMem ? '1024' : '1366'), 10);
  const height = parseInt(process.env.VIEWPORT_H || (lowMem ? '576' : '768'), 10);

  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=' + width + ',' + height,
    '--renderer-process-limit=1',
    '--in-process-gpu',
    '--disable-features=TranslateUI,BlinkGenPropertyTrees,IsolateOrigins,site-per-process',
    '--js-flags=--max-old-space-size=256'
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
    console.log(
      '[VM] Low-memory mode ON (window ' + width + 'x' + height + ', single-process, GPU off)'
    );
  }

  if (process.env.SINGLE_PROCESS === 'false') {
    const idx = args.indexOf('--single-process');
    if (idx >= 0) args.splice(idx, 1);
    console.log('[VM] single-process disabled');
  }

  // Visible browser (HEADLESS=false): remove flags that cause BLACK SCREEN
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
    // Use GPU / ANGLE so window paints
    filtered.push('--use-gl=angle');
    filtered.push('--enable-gpu-rasterization');
    console.log('[VM] HEADED mode – removed black-screen flags (gpu on)');
    return { isVm, lowMem: false, width, height, args: filtered };
  }

  return { isVm, lowMem, width, height, args };
}

module.exports = { findChromePath, findBrowserPath, vmwareArgs };
