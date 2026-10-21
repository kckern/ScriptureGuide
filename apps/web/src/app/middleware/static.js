import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { PRIVATE_FONTS_PATH } from '../../config/index.js';
import { privateFontCss } from '../../presentation/fontFaces.js';

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
  if (dir) router.use(PRIVATE_FONTS_PATH, express.static(dir, { index: false, dotfiles: 'ignore', maxAge: '30d' }));
  return router;
}

// The /private-fonts route (FONT_DIR) and the layout's @font-face (app.locals.fontFaceCss).
export function installPrivateFonts(app, fonts, opts) {
  app.use(privateFonts(fonts.dir));
  app.locals.fontFaceCss = privateFontCss(fonts, opts);
}
