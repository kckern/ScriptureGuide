// Clicky analytics through the site's own origin (Clicky's "anti-adblock" proxy setup, done here
// instead of in nginx). The page tag (layouts/main.ejs) loads /cd7dba44d5.js; that script sends
// its hits to /e9b1e2e71a. Both are relayed to Clicky:
//   GET /cd7dba44d5.js         -> static.getclicky.com/js?in=%2Fe9b1e2e71a, one shared copy kept
//                                 an hour and refreshed in the background
//   GET|POST /e9b1e2e71a?...   -> in.getclicky.com/in.php?..., with the visitor's address chain
// and only Clicky's own _cky_ignore/_cky_osa cookies, as in Clicky's nginx config; redirects are
// relayed, not followed. A failure never breaks a page: the script answers its last copy or 204,
// the beacon answers 204.
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
// After a failed fetch, no new fetch for this long: a stale copy is served, or else 204
const RETRY_MS = 60 * 1000;
const TIMEOUT_MS = 10 * 1000;
const SCRIPT_UA = 'scripture.guide clicky-proxy';

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
  let cached = null;      // { body: Buffer, until }
  let retryAt = 0;        // no fetch before this after a failure
  let inFlight = null;

  // One copy serves every visitor, so the fetch carries nothing of theirs: a fixed User-Agent,
  // no cookies and no X-Forwarded-For. Only a non-empty JavaScript answer is kept.
  const refresh = () => inFlight ??= (async () => {
    try {
      const res = await fetchImpl(SCRIPT_URL, {
        headers: { 'User-Agent': SCRIPT_UA },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (!res.ok) throw new Error(`clicky script: HTTP ${res.status}`);
      if (!/javascript|ecmascript/i.test(res.headers.get('content-type') ?? '')) throw new Error('clicky script: not JavaScript');
      const body = Buffer.from(await res.arrayBuffer());
      if (!body.length) throw new Error('clicky script: empty');
      cached = { body, until: now() + CACHE_MS };
    } catch {
      retryAt = now() + RETRY_MS;
    }
  })().finally(() => { inFlight = null; });

  const sendScript = (res, body) =>
    res.set('Cache-Control', 'public, max-age=3600').type('application/javascript').send(body);

  // A cached copy is answered at once, expired or not; an expired one is refreshed behind it.
  // Only the very first fetch (or the first after a failure wait with nothing cached) is waited for.
  router.get(SCRIPT_PATH, async (req, res) => {
    const t = now();
    if (cached) {
      if (t >= cached.until && t >= retryAt) refresh();
      return sendScript(res, cached.body);
    }
    if (t < retryAt) return res.status(204).end();
    await refresh();
    if (!cached) return res.status(204).end();
    sendScript(res, cached.body);
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
    const init = { method: req.method, headers, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) };
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
      const location = up.headers.get('location');
      if (location) res.set('Location', location);
      const cookies = up.headers.getSetCookie?.() ?? [];
      if (cookies.length) res.set('Set-Cookie', cookies);
      res.end(body);
    } catch {
      res.status(204).end();
    }
  };
  // The raw body, unparsed. A body it refuses (413 too large, 415 unsupported encoding) answers
  // 204 like any other proxy failure, not the site's error page.
  const rawBody = express.raw({ type: () => true, limit: '64kb' });
  const readBody = (req, res, next) => rawBody(req, res, err =>
    err ? res.set('Cache-Control', 'no-store').status(204).end() : next());

  router.get(BEACON_PATH, beacon);
  router.post(BEACON_PATH, readBody, beacon);

  return router;
}

export default clickyProxy;
