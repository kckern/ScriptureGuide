// Link-preview cards (og:image): a 1200×630 JPEG of a passage, drawn with satori (layout to SVG)
// and resvg (SVG to pixels), encoded with jpeg-js (pure JS; a PNG of the paper texture is ~500 KB). satori reads TTF/OTF only, so the fonts are TTF copies in assets/og/
// (GoudyScripture.ttf is a byte copy of fonts/goudy-scripture/, checked by scriptureFont.test.js).
//
// satori cannot shrink text to fit or cut it at a word boundary, so the title and body are
// measured here with opentype.js and set as explicit lines.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import opentype from 'opentype.js';
import jpeg from 'jpeg-js';
import { readableText } from '../../domain/rules/legacyText.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(here, '../../../assets/og');
const PUBLIC = path.resolve(here, '../../../public');

export const WIDTH = 1200;
export const HEIGHT = 630;

const INK = '#1b1410';
const MUTED = '#8a7566';
const RULE = '#a5897b';
const FRAME = 18;           // wood border
const PAD_X = 56;
const PAD_TOP = 44;
const PAD_BOTTOM = 30;
const INNER_W = WIDTH - 2 * FRAME - 2 * PAD_X;
const INNER_H = HEIGHT - 2 * FRAME - PAD_TOP - PAD_BOTTOM;
const BADGE_W = 240;
const BADGE_H = 80;
const BADGE_GAP = 32;
const TITLE_SIZES = [70, 64, 58, 52, 46];
// Largest first: a one-line verse is set large, a long passage small and cut.
const BODY_SIZES = [52, 48, 44, 40, 37, 34];
const JPEG_QUALITY = 85;
const LINE_HEIGHT = 1.3;
const FOOTER_SIZE = 26;
const FOOTER_H = 34;
const HEADER_GAP = 22;      // title row to rule
const BODY_GAP = 26;        // rule to body
// opentype.js and satori measure the same font, but leave a little room for rounding.
const FIT = 0.98;

const toArrayBuffer = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const dataUri = (file, type) => `data:${type};base64,${readFileSync(file).toString('base64')}`;

let fonts = null;
// The fonts as file bytes (for satori) and parsed (for measuring), loaded once.
export function ogFonts() {
  if (fonts) return fonts;
  const goudyData = readFileSync(path.join(ASSETS, 'GoudyScripture.ttf'));
  const robotoData = readFileSync(path.join(ASSETS, 'RobotoCondensed-Regular.ttf'));
  fonts = {
    goudyData,
    robotoData,
    goudy: opentype.parse(toArrayBuffer(goudyData)),
    paper: dataUri(path.join(PUBLIC, 'img/paper.jpg'), 'image/jpeg'),
    wood: dataUri(path.join(PUBLIC, 'img/back.jpg'), 'image/jpeg'),
    logo: dataUri(path.join(PUBLIC, 'logo.png'), 'image/png'),
  };
  return fonts;
}

// True when the font has a glyph for every character of the text (whitespace aside). Goudy
// Scripture has Latin, Greek and Cyrillic; Korean or Devanagari text gets the site card.
export function covers(font, text) {
  for (const ch of String(text || '')) {
    if (/\s/.test(ch)) continue;
    if (font.charToGlyphIndex(ch) === 0) return false;
  }
  return true;
}

const width = (font, text, size) => font.getAdvanceWidth(text, size);

// A word wider than the line, split into pieces that fit.
function splitWord(font, word, size, maxWidth) {
  const pieces = [];
  let piece = '';
  for (const ch of word) {
    if (piece && width(font, piece + ch, size) > maxWidth) { pieces.push(piece); piece = ''; }
    piece += ch;
  }
  if (piece) pieces.push(piece);
  return pieces;
}

// Greedy word wrap into at most maxLines lines of maxWidth. Text that does not fit is cut at a
// word boundary and the last line ends with "…".
export function fitLines(text, font, size, maxWidth, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
    .flatMap(w => (width(font, w, size) > maxWidth ? splitWord(font, w, size, maxWidth) : [w]));
  const lines = [];
  let line = '';
  let i = 0;
  for (; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (!line || width(font, next, size) <= maxWidth) { line = next; continue; }
    lines.push(line);
    line = words[i];
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) { lines.push(line); line = ''; i = words.length; }
  if (i >= words.length && !line) return { lines, truncated: false };

  // Cut: drop words from the last line until it fits with the ellipsis.
  let last = lines[lines.length - 1].split(' ');
  while (last.length > 1 && width(font, `${last.join(' ')}…`, size) > maxWidth) last.pop();
  // A sentence that ends at the cut keeps no dangling punctuation before the ellipsis.
  lines[lines.length - 1] = `${last.join(' ').replace(/[\s,;:.!?—–-]+$/, '')}…`;
  return { lines, truncated: true };
}

// The largest title size that fits on one line, else two lines at the smallest size.
function fitTitle(font, title, maxWidth) {
  for (const size of TITLE_SIZES) {
    if (width(font, title, size) <= maxWidth) return { size, lines: [title] };
  }
  const size = TITLE_SIZES[TITLE_SIZES.length - 1];
  return { size, lines: fitLines(title, font, size, maxWidth, 2).lines };
}

// The largest body size that fits the text whole, else the smallest, cut.
export function fitBody(body, font, maxWidth, maxHeight) {
  let fit;
  for (const size of BODY_SIZES) {
    const maxLines = Math.max(1, Math.floor(maxHeight / (size * LINE_HEIGHT)));
    fit = { size, ...fitLines(body, font, size, maxWidth * FIT, maxLines) };
    if (!fit.truncated) return fit;
  }
  return fit;
}

// satori element helper (no JSX)
const h = (type, style, children) => ({ type, props: { style, children } });
const img = (src, w, ht, style = {}) => ({ type: 'img', props: { src, width: w, height: ht, style: { width: w, height: ht, ...style } } });

function frame(f, children) {
  return h('div', {
    width: WIDTH, height: HEIGHT, display: 'flex', padding: FRAME,
    backgroundImage: `url(${f.wood})`, backgroundRepeat: 'repeat', backgroundSize: '500px 592px',
  }, [
    h('div', {
      // An exact size inside the frame, so the paper cannot grow over the right and bottom wood.
      display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflow: 'hidden',
      width: WIDTH - 2 * FRAME, height: HEIGHT - 2 * FRAME,
      padding: `${PAD_TOP}px ${PAD_X}px ${PAD_BOTTOM}px`,
      backgroundImage: `url(${f.paper})`, backgroundRepeat: 'repeat', backgroundSize: '402px 420px',
      boxShadow: 'inset 0 0 0 1px rgba(40, 20, 10, 0.55)',
    }, children),
  ]);
}

const footer = (justify = 'flex-start') => h('div', {
  display: 'flex', justifyContent: justify, height: FOOTER_H, alignItems: 'flex-end',
  fontFamily: 'Roboto Condensed', fontSize: FOOTER_SIZE, color: MUTED, letterSpacing: 1,
}, 'scripture.guide');

async function toJpeg(element) {
  const f = ogFonts();
  const svg = await satori(element, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: 'Goudy Scripture', data: f.goudyData, weight: 400, style: 'normal' },
      { name: 'Roboto Condensed', data: f.robotoData, weight: 400, style: 'normal' },
    ],
  });
  const image = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render();
  return jpeg.encode({ data: image.pixels, width: image.width, height: image.height }, JPEG_QUALITY).data;
}

// The card for anything that is not a passage (search, parallel, unknown references, text in a
// script Goudy Scripture lacks). badge: an edition badge data URI, or null.
export function renderSiteCard({ badge = null } = {}) {
  const f = ogFonts();
  return toJpeg(frame(f, [
    h('div', { display: 'flex', flexGrow: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }, [
      img(f.logo, 160, 160),
      h('div', { display: 'flex', marginTop: 28, fontFamily: 'Goudy Scripture', fontSize: 88, color: INK }, 'Scripture Guide'),
      ...(badge ? [img(badge, BADGE_W, BADGE_H, { marginTop: 28 })] : []),
    ]),
    footer('center'),
  ]));
}

// A passage card. title: "1 Nephi 5:3"; body: plain text; badge: data URI or null.
export function renderCard({ title, body, badge = null }) {
  const f = ogFonts();
  if (!covers(f.goudy, title) || !covers(f.goudy, body)) return renderSiteCard({ badge });

  const titleWidth = INNER_W - (badge ? BADGE_W + BADGE_GAP : 0);
  const t = fitTitle(f.goudy, title, titleWidth * FIT);
  const titleLine = Math.round(t.size * 1.12);
  const headerH = Math.max(badge ? BADGE_H : 0, t.lines.length * titleLine);
  const bodyH = INNER_H - headerH - HEADER_GAP - BODY_GAP - FOOTER_H - 8;
  const b = fitBody(body, f.goudy, INNER_W, bodyH);
  const bodyLine = Math.round(b.size * LINE_HEIGHT);

  return toJpeg(frame(f, [
    h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: headerH }, [
      h('div', { display: 'flex', flexDirection: 'column', fontFamily: 'Goudy Scripture', fontSize: t.size, color: INK, lineHeight: `${titleLine}px` },
        t.lines.map(l => h('div', { display: 'flex', whiteSpace: 'pre' }, l))),
      ...(badge ? [img(badge, BADGE_W, BADGE_H, { marginLeft: BADGE_GAP, borderRadius: 4 })] : []),
    ]),
    h('div', { display: 'flex', height: 2, marginTop: HEADER_GAP, backgroundColor: RULE, opacity: 0.6 }),
    h('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, marginTop: BODY_GAP, fontFamily: 'Goudy Scripture', fontSize: b.size, color: INK, lineHeight: `${bodyLine}px` },
      b.lines.map(l => h('div', { display: 'flex', whiteSpace: 'pre' }, l))),
    footer(),
  ]));
}

// Plain verse text: no markers or line breaks, inline marks kept as their text (legacyText
// readableText, as og:description)
export const plainVerse = text => readableText(text);

// What a passage card shows: its title, the edition badge name (as og:image used) and the body,
// which for a verse or range is its text and for a whole chapter the chapter summary, else its
// first verses.
export function cardContent(result, data, title) {
  const version = result.config?.version || 'LDS';
  const badge = data?.img || String(version).toLowerCase();
  const verses = (result.verses || []).map(v => plainVerse(v.text)).filter(Boolean);
  const ch = result.chapterHeading;
  const summary = result.config?._subChapter ? null : plainVerse(ch?.summary || '');
  let body = summary || '';
  if (!body) {
    for (const v of verses) {
      body = body ? `${body} ${v}` : v;
      if (body.length > 1200) break;
    }
  }
  return { title, badge, body };
}
