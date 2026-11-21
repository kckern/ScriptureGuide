// Clicky analytics through the site's own origin (Clicky's "anti-adblock" proxy setup, done here
// instead of in nginx). The page tag (layouts/main.ejs) loads /cd7dba44d5.js; that script sends
// its hits to /e9b1e2e71a. Both are relayed to Clicky:
//   GET /cd7dba44d5.js         -> static.getclicky.com/js?in=%2Fe9b1e2e71a, no cookies, kept an hour
//   GET|POST /e9b1e2e71a?...   -> in.getclicky.com/in.php?..., with the visitor's address chain
// and only Clicky's own _cky_ignore/_cky_osa cookies, as in Clicky's nginx config. A failure never
// breaks a page: the script answers its last copy or 204, the beacon answers 204.
// Mounted ahead of the body parsers in createApp, so a POST body is forwarded byte for byte.
import express from 'express';
import config from '../../config/index.js';
import { clientIp } from '../clientIp.js';

export const CLICKY_SITE_ID = '100988820';
export const SCRIPT_PATH = '/cd7dba44d5.js';
export const BEACON_PATH = '/e9b1e2e71a';

const SCRIPT_URL = 'https://static.getclicky.com/js?in=%2Fe9b1e2e71a';
const BEACON_URL = 'https://in.getclicky.com/in.php';
const CACHE_MS = 60 * 60 * 1000;
// After a failed refresh, a stale copy is served for this long before the next try
const RETRY_MS = 60 * 1000;
const TIMEOUT_MS = 10 * 1000;

// nginx's $proxy_add_x_forwarded_for, with the visitor (clientIp.js) as the appended address
function forwardedFor(req) {
  const visitor = (clientIp(req) ?? '').replace(/^::ffff:/, '');
  const incoming = req.headers['x-forwarded-for'];
  return [incoming, visitor].filter(Boolean).join(', ');
}

// Clicky's nginx map: "_cky_ignore=…; _cky_osa=…" when the visitor has _cky_ignore, else nothing
function clickyCookie(header = '') {
  const jar = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) jar[part.slice(0, i).trim()] ??= part.slice(i + 1).trim();
  }
  return jar._cky_ignore ? `_cky_ignore=${jar._cky_ignore}; _cky_osa=${jar._cky_osa ?? ''}` : null;
}

export function clickyProxy({ fetchImpl = fetch, now = Date.now, production = config.env === 'production' } = {}) {
  const router = express.Router();
  let cached = null;      // { body: Buffer, type, until }
  let inFlight = null;

  const refresh = async req => {
    const headers = { 'X-Forwarded-For': forwardedFor(req) };
    if (req.headers['user-agent']) headers['User-Agent'] = req.headers['user-agent'];
    try {
      const res = await fetchImpl(SCRIPT_URL, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`clicky script: HTTP ${res.status}`);
      const body = Buffer.from(await res.arrayBuffer());
      cached = { body, type: res.headers.get('content-type'), until: now() + CACHE_MS };
    } catch {
      if (cached) cached.until = now() + RETRY_MS;
    }
  };

  router.get(SCRIPT_PATH, async (req, res) => {
    if (!cached || now() >= cached.until) {
      inFlight ??= refresh(req).finally(() => { inFlight = null; });
      await inFlight;
    }
    if (!cached) return res.status(204).end();
    res.set('Cache-Control', 'public, max-age=3600').type('application/javascript').send(cached.body);
  });

  const beacon = async (req, res) => {
    const query = req.originalUrl.indexOf('?');
    const url = BEACON_URL + (query >= 0 ? req.originalUrl.slice(query) : '');
    const proto = req.secure || /(^|,)\s*https\s*(,|$)/i.test(req.headers['x-forwarded-proto'] ?? '') || production
      ? 'https' : 'http';
    const headers = {
      'X-Forwarded-Proto': proto,
      'X-Forwarded-For': forwardedFor(req),
    };
    if (req.headers.host) headers['X-Forwarded-Host'] = req.headers.host;
    if (req.headers['user-agent']) headers['User-Agent'] = req.headers['user-agent'];
    if (req.headers.referer) headers.Referer = req.headers.referer;
    const cookie = clickyCookie(req.headers.cookie);
    if (cookie) headers.Cookie = cookie;
    const init = { method: req.method, headers, signal: AbortSignal.timeout(TIMEOUT_MS) };
    if (req.method === 'POST') {
      if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
      init.body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    }
    res.set('Cache-Control', 'no-store');
    try {
      const up = await fetchImpl(url, init);
      const body = Buffer.from(await up.arrayBuffer());
      res.status(up.status);
      const type = up.headers.get('content-type');
      if (type) res.set('Content-Type', type);
      const cookies = up.headers.getSetCookie?.() ?? [];
      if (cookies.length) res.set('Set-Cookie', cookies);
      res.end(body);
    } catch {
      res.status(204).end();
    }
  };
  router.get(BEACON_PATH, beacon);
  router.post(BEACON_PATH, express.raw({ type: () => true, limit: '64kb' }), beacon);

  return router;
}

export default clickyProxy;
