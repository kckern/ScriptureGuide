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

const TEXTUAL = /^(text\/|application\/(javascript|json|xml))/;
export const isTextual = type => TEXTUAL.test(type);

// CSS/JS are compared as text (line endings and trailing spaces ignored); fonts and images by hash.
export function canonicalAsset(type, buf) {
  if (isTextual(type)) return buf.toString('utf8').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trimEnd();
  return `sha256 ${createHash('sha256').update(buf).digest('hex')} ${buf.length} bytes`;
}
