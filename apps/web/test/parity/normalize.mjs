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

// The live site headed a passage whose first verse starts a section with § alone (a psalm
// superscription, NIV Ps. 23:1 "§A psalm of David.¶▼…", or after a division label, NET Ps.
// 90:1 "Book 4 (Psalms 90-106)§A prayer…") with the section before it and an ellipsis; Node
// heads it with the section at that verse (owner decision 2026-10-22), and a whole chapter that
// is one section gets section nav. A first verse that opens with § before a "§¶" (NIV Ps. 1:1
// "§Psalms 1–41§¶Blessed…") keeps its label in a passage of its own, without live's heading.
//
// staleSectionVerse(live): { version, verseId } of the first verse when live shows the pattern
// (an h3 and ellipsis ending right before it), else null; the caller looks up that verse in the
// raw format (verse text and heading, which live gets right).
// staleSectionHeading(live, node, raw): live with the fix applied, or null when it does not
// apply. raw is the first verse's raw entry ({ text, headings: { heading, last } }); its text
// must start a section, and Node's h3 must be live's tag line with the section's
// heading_verse_id, last_verse_id and verse_count, and the raw heading as its text. For a label
// before "§¶", live's h3 and ellipsis are dropped and Node must show the raw heading after it.
// Nav labels are taken only where both sides link to the same place. Everything else compares.
export function staleSectionVerse(live) {
  const html = outputHtml(splitStatus(live)[1]);
  const m = html === null ? null : stalePattern(html.split('\n'));
  return m && { version: m.version, verseId: m.first };
}

export function staleSectionHeading(live, node, raw) {
  const [liveHead, liveRest] = splitStatus(live);
  const nodeRest = splitStatus(node)[1];
  const l = parseJsonObject(liveRest);
  const n = parseJsonObject(nodeRest);
  if (l || n) {
    if (typeof l?.output !== 'string' || typeof n?.output !== 'string') return null;
    const output = staleHeadingHtml(l.output, n.output, raw);
    return output === null ? null : liveHead + JSON.stringify({ ...l, output }, null, 1);
  }
  const html = staleHeadingHtml(liveRest, nodeRest, raw);
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

function outputHtml(text) {
  const j = parseJsonObject(text);
  if (j) return typeof j.output === 'string' ? j.output : null;
  return text;
}

const indent = line => line.match(/^\s*/)[0].length;
// The lines of the element at i: its tag line and everything indented deeper after it
function elementEnd(lines, i) {
  let j = i + 1;
  while (j < lines.length && indent(lines[j]) > indent(lines[i])) j++;
  return j;
}
const attr = (line, name) => line.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const setAttr = (line, name, value) => line.replace(new RegExp(`(\\s${name}=")[^"]*(")`), `$1${value}$2`);
const textOf = lines => lines.filter(x => /^\s*"/.test(x)).map(x => JSON.parse(x.trim())).join(' ');

// Live's first h3 + ellipsis ending right before the first verse span
function stalePattern(L) {
  const i = L.findIndex(line => /^\s*<h3 class="heading"/.test(line));
  if (i < 0) return null;
  const ellipsis = elementEnd(L, i);
  if (!/^\s*<p class="ellipses"/.test(L[ellipsis] ?? '') || indent(L[ellipsis]) !== indent(L[i])) return null;
  const last = Number(attr(L[ellipsis], 'last_verse_id'));
  if (attr(L[i], 'last_verse_id') !== String(last) || attr(L[ellipsis], 'heading_verse_id') !== attr(L[i], 'heading_verse_id')) return null;
  const rest = elementEnd(L, ellipsis);
  const s = L.findIndex((line, k) => k >= rest && /^\s*<span class="verse /.test(line));
  if (s < 0 || L.slice(rest, s).some(line => !/^\s*<(p|blockquote) /.test(line))) return null;
  const first = Number(attr(L[s], 'verse_id'));
  if (first !== last + 1 || !attr(L[i], 'ver')) return null;
  return { i, rest, first, version: attr(L[i], 'ver') };
}

// § at the start (not §¶), or after a label before the first ¶ (not §¶)
const OWN_SECTION = /^§(?!¶)|^[^¶§]+§(?!¶)/;
// § at the start, then a label, then §¶
const LABEL_THEN_SECTION = /^§[^¶§]+§¶/;

function staleHeadingHtml(live, node, raw) {
  const L = live.split('\n');
  const N = node.split('\n');
  const m = stalePattern(L);
  const heading = raw?.headings?.heading;
  const last = Number(raw?.headings?.last);
  if (!m || typeof raw?.text !== 'string' || !heading || !last) return null;
  const { i, rest, first } = m;
  if (L.slice(0, i).join('\n') !== N.slice(0, i).join('\n')) return null;
  const isSectionH3 = (lines, k) => /^\s*<h3 class="heading"/.test(lines[k] ?? '') && attr(lines[k], 'heading_verse_id') === String(first) &&
    textOf(lines.slice(k + 1, elementEnd(lines, k))) === heading;
  let out;
  if (LABEL_THEN_SECTION.test(raw.text)) {
    out = [...L.slice(0, i), ...L.slice(rest)];
    if (!N.some((line, k) => k > i && isSectionH3(N, k))) return null;
  } else if (OWN_SECTION.test(raw.text)) {
    // Node's h3: live's tag line for the section at the first verse, with the raw heading
    const tag = setAttr(setAttr(setAttr(L[i], 'heading_verse_id', first), 'last_verse_id', last), 'verse_count', last - first);
    if (N[i] !== tag || !isSectionH3(N, i)) return null;
    out = [...L.slice(0, i), ...N.slice(i, elementEnd(N, i)), ...L.slice(rest)];
  } else return null;
  // Nav labels where both sides link to the same place
  for (let k = 0; k < out.length && k < N.length; k++) {
    const link = /^\s*<a class="(prev|next)" href="[^"]*">$/;
    if (link.test(out[k]) && out[k] === N[k] && out.slice(Math.max(0, k - 3), k).some(x => /<div class="chapterNav">/.test(x)) &&
        /^\s*"/.test(out[k + 1] ?? '') && /^\s*"/.test(N[k + 1] ?? '')) out[k + 1] = N[k + 1];
  }
  return out.join('\n');
}

// passage_script.php's single_heading dropped the first verse (or verse part) of every section
// after the first, with the section's extras (summary, background, headnote); Node keeps them.
// True when live is Node with only such runs removed: each run is extras and paragraph tags
// around exactly one verse span, and every live line is matched in order.
const DROPPABLE_EXTRA = /^\s*<div class="(summary|background|headnote)"/;
export function singleHeadingDrops(live, node) {
  const L = live.split('\n');
  const N = node.split('\n');
  let i = 0, j = 0, runs = 0;
  while (j < N.length) {
    if (i < L.length && L[i] === N[j]) { i++; j++; continue; }
    let spans = 0;
    while (j < N.length && !(spans === 1 && i < L.length && L[i] === N[j])) {
      if (DROPPABLE_EXTRA.test(N[j])) j = elementEnd(N, j);
      else if (/^\s*<p class="[^"]*">$/.test(N[j])) j++;
      else if (/^\s*<span class="verse /.test(N[j]) && spans === 0) { spans++; j = elementEnd(N, j); }
      else return false;
    }
    if (spans !== 1) return false;
    runs++;
  }
  return i === L.length && runs > 0;
}

