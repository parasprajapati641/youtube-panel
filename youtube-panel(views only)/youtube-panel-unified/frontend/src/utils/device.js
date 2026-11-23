const DEVICE_KEY = 'smm_device_id';

/**
 * Get or create a persistent device ID for this browser.
 * Stored in localStorage so the same browser/device always sends the same ID.
 */
export function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      // Prefer crypto.randomUUID when available
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        id = crypto.randomUUID();
      } else {
        id =
          'dev_' +
          Math.random().toString(36).slice(2) +
          Date.now().toString(36) +
          Math.random().toString(36).slice(2);
      }
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    // localStorage blocked – fallback ephemeral id (device lock won't work well)
    return 'temp_' + Date.now();
  }
}

export function getDeviceInfo() {
  try {
    return navigator.userAgent || 'Unknown browser';
  } catch {
    return 'Unknown';
  }
}
