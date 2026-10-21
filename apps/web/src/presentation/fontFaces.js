// @font-face for the privately served text font, 'Goudy Scripture' (the first family in
// style.css's body stack). Empty without a base, so no font request is made and pages use
// Sorts Mill Goudy. The family name is unique so no system font can stand in for it.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { PRIVATE_FONTS_PATH } from '../config/index.js';

export const FAMILY = 'Goudy Scripture';
const SAFE = /^[A-Za-z0-9._~:/?#@!$&*+,;=%-]*$/; // no quotes, parentheses, spaces or angle brackets
const FORMATS = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' };

const face = (style, src) => `@font-face {
  font-family: '${FAMILY}';
  src: ${src};
  font-weight: 400;
  font-style: ${style};
  font-display: swap;
}`;

export function goudyFontFace({ base, goudyFile }) {
  if (!base) return '';
  for (const v of [base, goudyFile]) {
    if (!SAFE.test(v)) throw new Error(`Font URL part not allowed in CSS url(): ${JSON.stringify(v)}`);
  }
  const format = FORMATS[goudyFile.split('.').pop().toLowerCase()];
  return [
    face('normal', `url('${base}/${goudyFile}')${format ? ` format('${format}')` : ''}`),
    // The licensed file is upright only; a real italic beats the browser's synthesized oblique.
    face('italic', "url('/css/webfont/SortsMillGoudy-Italic.woff') format('woff')"),
  ].join('\n');
}

// goudyFontFace, checked at startup: when the font is served from FONT_DIR, the file must be
// there, or every page would request a 404. Missing: a warning and no @font-face.
export function privateFontCss(fonts, { exists = existsSync, warn = console.warn } = {}) {
  if (fonts.dir && fonts.base === PRIVATE_FONTS_PATH) {
    const file = path.join(fonts.dir, fonts.goudyFile);
    if (!exists(file)) {
      warn(`FONT_DIR: ${file} not found; serving pages without '${FAMILY}' (Sorts Mill Goudy instead)`);
      return '';
    }
  }
  return goudyFontFace(fonts);
}
