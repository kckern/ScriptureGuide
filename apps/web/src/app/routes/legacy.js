import { Router } from 'express';
import net from 'node:net';
import db from '../../data/db/connection.js';

// Top-level .php files the PHP site served, and where each lives in the Node app.
// Query strings are kept. index.php?q=<ref> becomes /<ref>; the fragments that only made
// sense inside index.php go to the page they belonged to.
const PHP_ROUTES = {
  'versebox.php': '/vbox',
  'passage_script.php': '/passage',
  'version_select.php': '/versionselect',
  'settings.php': '/settings',
  'save.php': '/save_prefs',
};
// Pages whose content was addressed by ?q=: index.php?q=john.3.16 → /john.3.16.
const PHP_PAGES = {
  'index.php': q => `/${q}`,
  'home.php': () => '/',
  'search.php': q => (q ? `/search/${q}` : '/'),
  'parallel.php': q => `/${q}`,
  'fax.php': q => `/${q}`,
  'notes.php': q => (q ? `/notes/${q}` : '/'),
};
// The other .php files in the PHP docroot, which Apache executed when requested: hub was an
// empty page (410 like hub.*); the rest were maintenance scripts or includes (script.php
// rewrote verse text, mount.php ran a shell command). They are gone. Any other *.php name did
// not exist, so Apache rewrote it to index.php?q=<name>.php: it goes on to the front controller.
// Names match case-insensitively on purpose (/Mount.php is 410 too): Apache matched files
// case-sensitively, so this is more conservative than live.
const PHP_GONE = new Set([
  'hub.php', 'mount.php', 'script.php', 'scriptures.php', 'scriptutil.php',
  'inc_api.php', 'inc_cov.php', 'inc_img.php', 'inc_latex.php', 'inc_markdown.php', 'inc_mp3.php',
  'inc_plain.php', 'inc_raw.php', 'inc_slide.php', 'inc_slideh.php', 'inc_xml.php',
]);

function queryString(query, drop = []) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query || {})) {
    if (drop.includes(k)) continue;
    for (const item of [].concat(v)) if (typeof item === 'string') params.append(k, item);
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

// Keep the request body on redirect for anything but GET/HEAD (308); browsers turn a 301 POST into GET.
const redirectStatus = req => (req.method === 'GET' || req.method === 'HEAD' ? 301 : 308);

export function legacyRouter({ checkDb = defaultCheckDb, checkSphinx = defaultCheckSphinx } = {}) {
  const router = Router();

  router.all(/^\/([A-Za-z0-9_-]+\.php)$/, (req, res, next) => {
    const file = req.params[0].toLowerCase();
    if (PHP_ROUTES[file]) {
      return res.redirect(redirectStatus(req), PHP_ROUTES[file] + queryString(req.query));
    }
    if (PHP_PAGES[file]) {
      const q = typeof req.query.q === 'string' ? req.query.q.replace(/^\/+/, '') : '';
      return res.redirect(redirectStatus(req), PHP_PAGES[file](encodePath(q)) + queryString(req.query, ['q']));
    }
    if (PHP_GONE.has(file)) return res.status(410).type('text').send('Gone');
    return next();
  });

  // Liveness and readiness: 200 when the database answers, 503 when it does not.
  router.get('/healthz', async (req, res) => {
    const body = { status: 'ok', db: 'ok' };
    try { await checkDb(); } catch { body.db = 'down'; body.status = 'error'; }
    const sphinx = await checkSphinx();
    if (sphinx) {
      body.sphinx = sphinx;
      if (sphinx !== 'ok' && body.status === 'ok') body.status = 'degraded';
    }
    res.status(body.db === 'ok' ? 200 : 503).json(body);
  });

  return router;
}

// Keep reference punctuation readable (john.3.16, d&c.4, a~b) but never allow a scheme or host.
function encodePath(q) {
  return q.split('/').map(seg => encodeURIComponent(seg).replace(/%26/g, '&').replace(/%7E/gi, '~').replace(/%3A/gi, ':').replace(/%3B/gi, ';').replace(/%2C/gi, ',')).join('/');
}

async function defaultCheckDb() {
  await db.query('SELECT 1');
}

// Sphinx is checked only when SPHINX_HOST is configured: a TCP connect to its SphinxQL port.
function defaultCheckSphinx() {
  const host = process.env.SPHINX_HOST;
  if (!host) return Promise.resolve(null);
  const port = parseInt(process.env.SPHINX_PORT, 10) || 9306;
  return new Promise(resolve => {
    const socket = net.connect({ host, port });
    const done = state => { socket.destroy(); resolve(state); };
    socket.setTimeout(1000, () => done('down'));
    socket.once('connect', () => done('ok'));
    socket.once('error', () => done('down'));
  });
}

export default legacyRouter;
