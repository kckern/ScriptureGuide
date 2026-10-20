#!/usr/bin/env node
// Build a parity corpus from nginx-proxy-manager access logs: keep successful GETs to
// scripture.guide hosts, group them by output format and request shape, and sample a few
// of each group.
//
//   node test/parity/traffic.mjs [--per-shape N] [--max-groups N] <access.log|.gz> [more…] > test/parity/.cache/traffic.json
//
// The output holds paths real users requested (search terms included), so it belongs in
// .cache/ (gitignored) and never in the repo.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { formatForSubdomain } from '../../src/domain/rules/requestParsing.js';

const LINE = /^\[[^\]]+\] \S+ (\d{3}) \S+ - (\S+) \S+ (\S+) "([^"]*)"/;
const STATIC = /^\/(js|css|img|fonts?)\/|\.(js|css|png|jpe?g|gif|svg|ico|woff2?|ttf|eot)$/i;

// Formats run.mjs can compare (see canonical() there). Others are counted and skipped.
const COMPARABLE = new Set(['html', 'api', 'meta', 'raw', 'plain', 'latex', 'markdown', 'xml', 'notes',
  'passage', 'versionselect', 'vbox']);
// AJAX endpoints served on the main host; each is its own harness format.
const AJAX = { '/passage': 'passage', '/versionselect': 'versionselect', '/vbox': 'vbox' };
// AJAX endpoints that read or write the session: not comparable request by request.
const SESSION = new Set(['/settings', '/save_prefs']);

// Why a log line is not kept, or the request it holds.
export function classify(text) {
  const m = LINE.exec(text);
  if (!m) {
    // "- - 301": answered by the proxy itself (http → https redirect), no upstream status
    const proxy = /^\[[^\]]+\] \S+ - (\d{3}) /.exec(text);
    return { skip: proxy ? `proxy ${proxy[1]}` : 'unparsed' };
  }
  const [, status, method, rawHost, path] = m;
  const host = rawHost.toLowerCase();
  if (host !== 'scripture.guide' && !host.endsWith('.scripture.guide')) return { skip: 'other host' };
  if (method !== 'GET') return { skip: 'not GET' };
  if (status !== '200') return { skip: `status ${status}` };
  if (STATIC.test(path.split('?')[0])) return { skip: 'static file' };
  return { req: { method, status: Number(status), host, path } };
}

export function parseLine(text) {
  return classify(text).req ?? null;
}

// Harness format for a kept request, or { skip } when the harness cannot compare it.
export function formatOf({ host, path }) {
  const labels = host.split('.');
  // api.plain.scripture.guide, www.plain.scripture.guide: run.mjs sends one subdomain only
  if (labels.length > 3) return { skip: 'host flags' };
  const sub = labels.length === 3 && labels[0] !== 'www' ? labels[0] : '';
  let format = sub ? formatForSubdomain(sub) : 'html';
  // probes and typos: w-ww, wordpress, staging…
  if (sub && format === 'html') return { skip: 'unknown subdomain' };
  const bare = path.split('?')[0].toLowerCase();
  if (SESSION.has(bare)) return { skip: 'session ajax' };
  if (format === 'html' && AJAX[bare]) format = AJAX[bare];
  // PHP path shortcuts that pick a non-comparable format
  if (/^\/(img|imgc)\//i.test(path)) format = 'img';
  if (/^\/mp3\//i.test(path)) format = 'audio';
  if (!COMPARABLE.has(format)) return { skip: `format ${format}` };
  return { format };
}

// Abstract a path so requests that differ only in book, chapter, verse, version or search
// words group together: "/kjv/john.3.16" → "/V/a.9.9".
export function shapeOf(path) {
  const qi = path.indexOf('?');
  let p = qi < 0 ? path : path.slice(0, qi);
  const query = qi < 0 ? '' : path.slice(qi + 1);
  let prefix = '';
  const version = /^\/(?!search\/)[a-z0-9*.]+\/(?=[^/])/i.exec(p);
  if (version) { prefix = '/V'; p = p.slice(version[0].length - 1); }
  const abstract = s => s.replace(/\d+/g, '9').replace(/[a-z]+/gi, 'a');
  let shape = prefix + abstract(p);
  if (query) {
    shape += '?' + query.split('&').map(kv => {
      const eq = kv.indexOf('=');
      return eq < 0 ? kv : kv.slice(0, eq) + '=' + abstract(kv.slice(eq + 1));
    }).join('&');
  }
  return shape;
}

// At most n distinct paths per (format, shape), taken in path order. With maxGroups, only
// the most-requested groups are kept (ties broken by key), so the corpus follows traffic.
export function sample(reqs, n, maxGroups = Infinity) {
  const groups = new Map();
  const hits = new Map();
  for (const r of reqs) {
    const key = r.format + ' ' + shapeOf(r.path);
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(r.path);
    hits.set(key, (hits.get(key) ?? 0) + 1);
  }
  const keys = [...groups.keys()].sort((a, b) => hits.get(b) - hits.get(a) || (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, maxGroups).sort();
  const out = [];
  for (const key of keys) {
    const format = key.slice(0, key.indexOf(' '));
    for (const path of [...groups.get(key)].sort().slice(0, n)) out.push({ format, path });
  }
  return out;
}

function main(argv) {
  const args = [...argv];
  const take = (name, fallback) => {
    const i = args.indexOf(name);
    if (i < 0) return fallback;
    const value = Number(args[i + 1]);
    args.splice(i, 2);
    return value;
  };
  const perShape = take('--per-shape', 3);
  const maxGroups = take('--max-groups', Infinity);
  if (!args.length || !(perShape > 0) || !(maxGroups > 0)) {
    console.error('usage: traffic.mjs [--per-shape N] [--max-groups N] <access.log|.gz> [more…] > .cache/traffic.json');
    process.exit(2);
  }
  const skipped = {};
  const reqs = [];
  let lines = 0;
  for (const file of args) {
    const buf = readFileSync(file);
    const text = (file.endsWith('.gz') ? gunzipSync(buf) : buf).toString('utf8');
    for (const line of text.split('\n')) {
      if (!line) continue;
      lines++;
      const c = classify(line);
      const f = c.req ? formatOf(c.req) : c;
      if (f.skip) { skipped[f.skip] = (skipped[f.skip] ?? 0) + 1; continue; }
      reqs.push({ format: f.format, path: c.req.path });
    }
  }
  const sampled = sample(reqs, perShape, maxGroups);
  const groups = new Set(reqs.map(r => r.format + ' ' + shapeOf(r.path))).size;
  const byFormat = {};
  for (const r of sampled) byFormat[r.format] = (byFormat[r.format] ?? 0) + 1;
  console.error(`lines read  ${lines}\nkept        ${reqs.length}\ngroups      ${groups}\nsampled     ${sampled.length} (per shape ${perShape}, max groups ${maxGroups})`);
  console.error('sampled by format: ' + Object.entries(byFormat).map(([k, v]) => `${k} ${v}`).join(', '));
  console.error('skipped:');
  for (const [reason, count] of Object.entries(skipped).sort((a, b) => b[1] - a[1])) {
    console.error(`  ${String(count).padStart(8)}  ${reason}`);
  }
  process.stdout.write(JSON.stringify(sampled.map(r => [r.format, r.path]), null, 0) + '\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
