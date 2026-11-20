import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../public');

// Live (Apache/openresty) sends .ico as image/vnd.microsoft.icon; Express 4 would say image/x-icon.
function setHeaders(res, filePath) {
  if (path.extname(filePath).toLowerCase() === '.ico') res.setHeader('Content-Type', 'image/vnd.microsoft.icon');
}

// An hour of browser caching: live sent no Cache-Control and browsers kept its assets by
// heuristic, while max-age=0 revalidated every asset on every page. Names are not fingerprinted,
// so a deploy reaches browsers within the hour.
export function publicStatic(dir = PUBLIC_DIR) {
  return express.static(dir, { setHeaders, maxAge: '1h' });
}

// The Chrome extension's privacy policy (public/privacy.html) at the URL its store listing uses.
// Registered ahead of the reference routes, which would otherwise search for "privacy-policy".
export function privacyPolicy(dir = PUBLIC_DIR) {
  const router = express.Router();
  router.get('/privacy-policy', (req, res) => res.sendFile(path.join(dir, 'privacy.html'), { maxAge: '1h' }));
  return router;
}
