// @font-face for the privately served text font (family 'Goudy', the first in style.css's body
// stack). Empty without a base, so no font request is made and pages use Sorts Mill Goudy.
const SAFE = /^[A-Za-z0-9._~:/?#@!$&*+,;=%-]*$/; // no quotes, parentheses, spaces or angle brackets
const FORMATS = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' };

export function goudyFontFace({ base, goudyFile }) {
  if (!base) return '';
  for (const v of [base, goudyFile]) {
    if (!SAFE.test(v)) throw new Error(`Font URL part not allowed in CSS url(): ${JSON.stringify(v)}`);
  }
  const format = FORMATS[goudyFile.split('.').pop().toLowerCase()];
  return `@font-face {
  font-family: 'Goudy';
  src: url('${base}/${goudyFile}')${format ? ` format('${format}')` : ''};
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}`;
}
