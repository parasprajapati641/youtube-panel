function normalizeCookies(raw = []) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => {
      if (!c || !c.name || c.value === undefined) return null;
      let expires = c.expires;
      if (expires === undefined && c.expirationDate !== undefined) {
        const ts = Number(c.expirationDate);
        expires = ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts);
      }
      let sameSite = c.sameSite;
      if (sameSite) {
        const s = String(sameSite).toLowerCase();
        if (s === 'no_restriction' || s === 'none') sameSite = 'None';
        else if (s === 'lax') sameSite = 'Lax';
        else if (s === 'strict') sameSite = 'Strict';
        else sameSite = undefined;
      }
      const out = {
        name: c.name,
        value: String(c.value),
        domain: c.domain || '.youtube.com',
        path: c.path || '/',
        httpOnly: !!c.httpOnly,
        secure: c.secure !== false,
        sameSite
      };
      if (expires && !isNaN(expires) && expires > 0 && c.session !== true) {
        out.expires = expires;
      }
      return out;
    })
    .filter(Boolean);
}

function hasAuthCookies(cookies = []) {
  const names = new Set(cookies.map((c) => c.name));
  return (
    names.has('SID') ||
    names.has('SSID') ||
    names.has('__Secure-1PSID') ||
    names.has('LOGIN_INFO') ||
    names.has('SAPISID')
  );
}

module.exports = { normalizeCookies, hasAuthCookies };
