// Canonical forms for comparing PHP and Node responses: differences in quoting,
// attribute order, indentation and JSON key order are not parity failures.
import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';

const collapse = s => s.replace(/\s+/g, ' ').trim();

function serialize($, node, depth, out) {
  if (node.type === 'text') {
    const t = collapse(node.data);
    if (t) out.push('  '.repeat(depth) + JSON.stringify(t));
    return;
  }
  if (node.type !== 'tag' && node.type !== 'script' && node.type !== 'style') return;
  const attrs = Object.entries(node.attribs || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => ` ${k}=${JSON.stringify(collapse(v))}`)
    .join('');
  out.push('  '.repeat(depth) + `<${node.name}${attrs}>`);
  for (const child of node.children || []) serialize($, child, depth + 1, out);
}

// One line per element or non-empty text node, indented by depth.
export function canonicalHtml(html, selector) {
  const $ = cheerio.load(html, null, !selector && !/<html[\s>]/i.test(html) ? false : true);
  const roots = selector ? $(selector).toArray() : $.root().contents().toArray();
  const out = [];
  for (const node of roots) serialize($, node, 0, out);
  return out.join('\n');
}

function sortKeys(v, htmlKeys) {
  if (Array.isArray(v)) return v.map(x => sortKeys(x, htmlKeys));
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map(k => [
      k,
      htmlKeys.includes(k) && typeof v[k] === 'string' ? canonicalHtml(v[k]) : sortKeys(v[k], htmlKeys),
    ]));
  }
  return v;
}

export function canonicalJson(text, htmlKeys = []) {
  return JSON.stringify(sortKeys(JSON.parse(text), htmlKeys), null, 1);
}

export function compare(expected, actual) {
  if (expected === actual) return { equal: true };
  const e = expected.split('\n');
  const a = actual.split('\n');
  for (let i = 0; i < Math.max(e.length, a.length); i++) {
    if (e[i] !== a[i]) return { equal: false, line: i + 1, expected: e[i], actual: a[i] };
  }
  return { equal: false, line: 0 };
}

const TEXTUAL = /^(text\/|application\/(javascript|json|xml))|\+xml$/;
// "Text/CSS; charset=UTF-8" -> "text/css"
export const mediaType = type => (type || '').split(';')[0].trim().toLowerCase();
export const isTextual = type => TEXTUAL.test(mediaType(type));

// CSS/JS/SVG are compared as text (line endings and trailing spaces ignored); fonts and images by hash.
export function canonicalAsset(type, buf) {
  if (isTextual(type)) return buf.toString('utf8').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trimEnd();
  return `sha256 ${createHash('sha256').update(buf).digest('hex')} ${buf.length} bytes`;
}

// Cached live responses: text bodies as a utf8 `body` string (the original format, so older
// cache files still read), binary bodies (fonts, images) as `bodyBase64`.
export function encodeCacheEntry({ status, type, buf }) {
  return isTextual(type) ? { status, type, body: buf.toString('utf8') } : { status, type, bodyBase64: buf.toString('base64') };
}

export function decodeCacheEntry({ status, type, body, bodyBase64 }) {
  const buf = bodyBase64 !== undefined ? Buffer.from(bodyBase64, 'base64') : Buffer.from(body, 'utf8');
  return { status, type, buf, body: buf.toString('utf8') };
}

// Home page cleanups the owner chose to keep (controller decision 2026-10-20): the live page's
// leftover value="Test" in the search box (JS replaced it on load), the fbclid tracking tag on
// the Chrome Web Store link, and the line-heigth typo with the unspaced style next to it.
// They are rewritten in canonical HTML, on these exact elements only, so a home page compares
// equal while every other difference on it, or on a page that should not be home, still shows.
const HOME_CLEANUPS = [
  [/^(\s*<input id="searchbox" name="searchbox" type="text" value=)"Test">$/gm, '$1"">'],
  [/^(\s*<a class="button" href="https:\/\/chrome\.google\.com\/webstore\/detail\/scripture-guide\/[^"?]*\?hl=en)&fbclid=[^"&]*(" target="_blank">)$/gm, '$1$2'],
  [/^(\s*<img src="\/img\/chrome\.png" style="float:left; margin-bottom:100px;)(margin-top:50px; margin-right:30px;" width="128">)$/gm, '$1 $2'],
  [/^(\s*<h3 style="line-)heigth(:1em">)$/gm, '$1height$2'],
];

export function homeCleanups(canonical) {
  return HOME_CLEANUPS.reduce((text, [re, to]) => text.replace(re, to), canonical);
}

// search.php echoed the search term into a JS string unescaped (a reflected XSS on live);
// Node prints it as a JSON string literal. Decode Node's literal to the raw term so the term
// itself is still compared; a raw live line is left as it is (it does not parse as one literal).
export function rawSearchterm(body) {
  return body.replace(/(searchterm = )("(?:[^"\\\n]|\\.)*")(;)/g, (all, pre, literal, end) => {
    try { return `${pre}"${JSON.parse(literal)}"${end}`; } catch { return all; }
  });
}
