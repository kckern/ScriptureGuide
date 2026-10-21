import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../public');

// Live (Apache/openresty) sends .ico as image/vnd.microsoft.icon; Express 4 would say image/x-icon.
function setHeaders(res, filePath) {
  if (path.extname(filePath).toLowerCase() === '.ico') res.setHeader('Content-Type', 'image/vnd.microsoft.icon');
}

export function publicStatic(dir = PUBLIC_DIR) {
  return express.static(dir, { setHeaders });
}

// FONT_DIR (licensed fonts that must not be published) at /private-fonts; no route when unset.
export function privateFonts(dir) {
  const router = express.Router();
  if (dir) router.use('/private-fonts', express.static(dir, { index: false, dotfiles: 'ignore', maxAge: '30d' }));
  return router;
}
