'use strict';

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '..', 'working_proxies.json');

class ProxyPoolManager {
  constructor() {
    this.proxies = [];
    this.loadFromDisk();
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
        if (Array.isArray(data) && data.length > 0) {
          this.proxies = data;
          console.log(`[PROXY-POOL] Disk par thi ${this.proxies.length} verified proxies load thaya.`);
        }
      }
    } catch (e) {
      console.warn('[PROXY-POOL] File read error:', e.message);
    }
  }

  saveToDisk() {
    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(this.proxies, null, 2));
    } catch (_) {}
  }

  async scrapeAndHarvest() {
    this.loadFromDisk();
    return this.proxies;
  }

  getProxyForProfile(profileName) {
    if (!this.proxies.length) this.loadFromDisk();
    if (!this.proxies.length) return null;
    let hash = 0;
    for (let i = 0; i < profileName.length; i++) {
      hash = (hash * 31 + profileName.charCodeAt(i)) >>> 0;
    }
    return this.proxies[hash % this.proxies.length];
  }

  markDead(serverUrl) {
    console.log(`[PROXY-POOL] Proxy temporary skip (${serverUrl})`);
  }
}

module.exports = new ProxyPoolManager();