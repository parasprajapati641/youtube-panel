'use strict';

const path = require('path');
const { launchStealthProfile } = require('./bot/utils/browser.util');

async function runTest() {
  console.log('=== FINGERPRINT + PROXY + HUMAN TEST START ===');

  // Test 1: Direct IP (Instant 5 second verification)
  console.log('\n--- TEST 1: Direct IP Fingerprint Check ---');
  const bot1 = await launchStealthProfile('user_profile_001', {
    useProxy: false,
    headless: false, // Screen par browser dekhashe
  });

  try {
    await bot1.page.goto('https://bot.sannysoft.com/', { waitUntil: 'domcontentloaded', timeout: 25000 });
    const status1 = await bot1.page.evaluate(() => ({
      webdriver: navigator.webdriver,
      platform: navigator.platform,
      screen: `${screen.width}x${screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      gpu: (() => {
        const gl = document.createElement('canvas').getContext('webgl');
        const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
        return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'N/A';
      })(),
    }));
    console.log('[TEST 1 RESULT]:', status1);
    await bot1.simulateHuman();
    await bot1.page.screenshot({ path: path.join(__dirname, 'test1_direct.png'), fullPage: true });
    console.log('[TEST 1] Screenshot saved: test1_direct.png');
  } finally {
    await bot1.context.close();
  }

  // Test 2: Free Scraped Reusable Proxy + Geo Sync Check
  console.log('\n--- TEST 2: Reusable Proxy + Fingerprint Check ---');
  const bot2 = await launchStealthProfile('user_profile_002', {
    useProxy: true,
    headless: false,
    harvestTarget: 200, // Testing mate 200 proxies (5000 mate 5000 lakhvu)
  });

  try {
    await bot2.page.goto('https://bot.sannysoft.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    const status2 = await bot2.page.evaluate(() => ({
      webdriver: navigator.webdriver,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: `${screen.width}x${screen.height}`,
    }));
    console.log('[TEST 2 RESULT]:', status2);
    await bot2.simulateHuman();
    await bot2.page.screenshot({ path: path.join(__dirname, 'test2_proxy.png'), fullPage: true });
    console.log('[TEST 2] Screenshot saved: test2_proxy.png');
  } catch (err) {
    console.error('[TEST 2 ERROR]:', err.message);
    bot2.markProxyDead();
  } finally {
    await bot2.context.close();
  }

  console.log('\n=== ALL TESTS COMPLETE ===');
}

runTest().catch((e) => console.error('FATAL:', e));