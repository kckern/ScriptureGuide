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

// The live site headed a passage whose first verse opens with § but not §¶ (a psalm
// superscription, NIV Ps. 23:1 "§A psalm of David.¶▼…") with the section before it and an
// ellipsis; Node heads it with the section at that verse (owner decision 2026-10-22), and a
// whole chapter that is one section gets section nav. Given the canonical live and Node
// responses (html, or api with its "output"), returns live with that heading and the nav labels
// taken from Node, or null when live does not show the pattern. Only these lines are taken:
// live's h3 and ellipsis must end right before the first verse, Node's h3 must be at that verse,
// and a nav label only where both sides link to the same place. Everything else still compares.
export function staleSectionHeading(live, node) {
  const [liveHead, liveRest] = splitStatus(live);
  const [nodeHead, nodeRest] = splitStatus(node);
  const l = parseJsonObject(liveRest);
  const n = parseJsonObject(nodeRest);
  if (l || n) {
    if (typeof l?.output !== 'string' || typeof n?.output !== 'string') return null;
    const output = staleHeadingHtml(l.output, n.output);
    return output === null ? null : liveHead + JSON.stringify({ ...l, output }, null, 1);
  }
  const html = staleHeadingHtml(liveRest, nodeRest);
  return html === null ? null : liveHead + html;
}

function splitStatus(text) {
  const m = text.match(/^STATUS \d+\n/);
  return m ? [m[0], text.slice(m[0].length)] : ['', text];
}

function parseJsonObject(text) {
  if (!text.trimStart().startsWith('{')) return null;
  try { return JSON.parse(text); } catch { return null; }
}

const indent = line => line.match(/^\s*/)[0].length;
// The lines of the element at i: its tag line and everything indented deeper after it
function elementEnd(lines, i) {
  let j = i + 1;
  while (j < lines.length && indent(lines[j]) > indent(lines[i])) j++;
  return j;
}
const attr = (line, name) => line.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

function staleHeadingHtml(live, node) {
  const L = live.split('\n');
  const N = node.split('\n');
  const i = L.findIndex(line => /^\s*<h3 class="heading"/.test(line));
  if (i < 0) return null;
  const ellipsis = elementEnd(L, i);
  if (!/^\s*<p class="ellipses"/.test(L[ellipsis] ?? '') || indent(L[ellipsis]) !== indent(L[i])) return null;
  const last = Number(attr(L[ellipsis], 'last_verse_id'));
  if (attr(L[i], 'last_verse_id') !== String(last) || attr(L[ellipsis], 'heading_verse_id') !== attr(L[i], 'heading_verse_id')) return null;
  const rest = elementEnd(L, ellipsis);
  // The first verse after it: the next span.verse and its text line
  const s = L.findIndex((line, k) => k >= rest && /^\s*<span class="verse /.test(line));
  if (s < 0 || L.slice(rest, s).some(line => !/^\s*<(p|blockquote) /.test(line))) return null;
  const first = Number(attr(L[s], 'verse_id'));
  const text = L[s + 1]?.trim() ?? '';
  if (first !== last + 1 || !text.startsWith('"§') || text.startsWith('"§¶')) return null;
  // Node: the same lines before, then its h3 at the first verse, then the same verse lines
  if (L.slice(0, i).join('\n') !== N.slice(0, i).join('\n')) return null;
  if (!/^\s*<h3 class="heading"/.test(N[i] ?? '') || attr(N[i], 'heading_verse_id') !== String(first)) return null;
  const out = [...L.slice(0, i), ...N.slice(i, elementEnd(N, i)), ...L.slice(rest)];
  // Nav labels where both sides link to the same place
  for (let k = 0; k < out.length && k < N.length; k++) {
    const link = /^\s*<a class="(prev|next)" href="[^"]*">$/;
    if (link.test(out[k]) && out[k] === N[k] && out.slice(Math.max(0, k - 3), k).some(x => /<div class="chapterNav">/.test(x)) &&
        /^\s*"/.test(out[k + 1] ?? '') && /^\s*"/.test(N[k + 1] ?? '')) out[k + 1] = N[k + 1];
  }
  return out.join('\n');
}
