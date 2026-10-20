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

// nginx-proxy-manager log_format:
//   [$time_local] $upstream_cache_status $upstream_status $status - $request_method $scheme $host "$request_uri" [Client $remote_addr] …
// $upstream_status may list retries ("502, 200"), so the client $status is the number right before " - METHOD".
const LINE = /^\[[^\]]+\] (.*?) ?(\S+) (\d{3}) - ([A-Z]+) \S+ (\S+) "([^"]*)"/;
const CLIENT = /\[Client ([^\]]+)\]/;
const STATIC = /^\/(js|css|img|fonts?)\/|\.(js|css|png|jpe?g|gif|svg|ico|woff2?|ttf|eot)$/i;
// Scanner probes: dot-segments (/.env, /.git/, /.well-known/), server-side scripts and config
// files, and well-known CMS/admin paths. They are kept, but as one shape per format.
const PROBE = new RegExp([
  String.raw`(^|/)\.[^/]`,
  String.raw`\.(php\d?|aspx?|jsp|cgi|env|ini|bak|old|sql|ya?ml|conf|log|txt|json|xml|zip|tar|gz|rar|7z)(\?|$|/)`,
  String.raw`^/+(wp-|wp/|wordpress|blog/|cgi-bin|phpmyadmin|pma/|vendor/|admin|administrator|xmlrpc|owa/|ecp/|actuator|solr|console|boaform|hnap1|api/v\d|_api/)`,
].join('|'), 'i');

// Formats run.mjs can compare (see canonical() there). Others are counted and skipped.
const COMPARABLE = new Set(['html', 'api', 'meta', 'raw', 'plain', 'latex', 'markdown', 'xml', 'notes',
  'passage', 'versionselect', 'vbox']);
// AJAX endpoints served on the main host; each is its own harness format.
const AJAX = { '/passage': 'passage', '/versionselect': 'versionselect', '/vbox': 'vbox' };
// AJAX endpoints that read or write the session: not comparable request by request.
const SESSION = new Set(['/settings', '/save_prefs']);
// Probes get one shape per format and at most this many samples.
const PROBE_SAMPLES = 2;

// Files crawlers ask for legitimately; they keep their own shapes.
const CRAWLER_FILES = /^\/((robots|llms|ads|humans|security)\.txt|sitemap[^/]*)$/i;

export const isProbe = path => !CRAWLER_FILES.test(path.split('?')[0]) && PROBE.test(path);

// Why a log line is not kept, or the request it holds (plus the client, for ranking only).
export function classify(text) {
  const m = LINE.exec(text);
  if (!m) return { skip: 'unparsed' };
  const [, , upstream, status, method, rawHost, path] = m;
  const host = rawHost.toLowerCase();
  if (host !== 'scripture.guide' && !host.endsWith('.scripture.guide')) return { skip: 'other host' };
  if (method !== 'GET') return { skip: 'not GET' };
  if (status !== '200') {
    // "- - 301": the proxy itself redirected (http → https); PHP never saw it
    return { skip: upstream === '-' && /^30\d$/.test(status) ? `proxy ${status}` : `status ${status}` };
  }
  if (STATIC.test(path.split('?')[0])) return { skip: 'static file' };
  return { req: { method, status: Number(status), host, path }, client: CLIENT.exec(text)?.[1] };
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
  // PHP path shortcut to audio (/img/ never gets here: classify drops it as static)
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
  const abstract = s => s.replace(/(%[0-9a-f]{2})+/gi, '%').replace(/\d+/g, '9').replace(/[a-z]+/gi, 'a');
  let shape = prefix + abstract(p);
  if (query) {
    shape += '?' + query.split('&').map(kv => {
      const eq = kv.indexOf('=');
      return eq < 0 ? kv : kv.slice(0, eq) + '=' + abstract(kv.slice(eq + 1));
    }).join('&');
  }
  return shape;
}

const groupOf = r => r.format + ' ' + (isProbe(r.path) ? 'probe' : shapeOf(r.path));

// Rank by distinct clients, then hits; requests without a client count as one client each hit.
function tally(map, key, client) {
  const t = map.get(key) ?? { clients: new Set(), hits: 0 };
  t.clients.add(client ?? Symbol());
  t.hits++;
  map.set(key, t);
  return t;
}
const byPopularity = map => (a, b) =>
  map.get(b).clients.size - map.get(a).clients.size || map.get(b).hits - map.get(a).hits || (a < b ? -1 : a > b ? 1 : 0);

// Per (format, shape) group, the n paths requested by the most clients (then hits, then path
// order); probes share one group per format and give at most PROBE_SAMPLES. With maxGroups,
// only the groups requested by the most clients are kept.
export function sample(reqs, n, maxGroups = Infinity) {
  const groups = new Map();
  const paths = new Map();
  for (const r of reqs) {
    const key = groupOf(r);
    tally(groups, key, r.client);
    if (!paths.has(key)) paths.set(key, new Map());
    tally(paths.get(key), r.path, r.client);
  }
  const keys = [...groups.keys()].sort(byPopularity(groups)).slice(0, maxGroups).sort();
  const out = [];
  for (const key of keys) {
    const format = key.slice(0, key.indexOf(' '));
    const limit = key.endsWith(' probe') ? Math.min(n, PROBE_SAMPLES) : n;
    const inGroup = paths.get(key);
    for (const path of [...inGroup.keys()].sort(byPopularity(inGroup)).slice(0, limit)) out.push({ format, path });
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
  let probes = 0;
  for (const file of args) {
    const buf = readFileSync(file);
    const text = (file.endsWith('.gz') ? gunzipSync(buf) : buf).toString('utf8');
    for (const line of text.split('\n')) {
      if (!line) continue;
      lines++;
      const c = classify(line);
      const f = c.req ? formatOf(c.req) : c;
      if (f.skip) { skipped[f.skip] = (skipped[f.skip] ?? 0) + 1; continue; }
      if (isProbe(c.req.path)) probes++;
      reqs.push({ format: f.format, path: c.req.path, client: c.client });
    }
  }
  const sampled = sample(reqs, perShape, maxGroups);
  const groups = new Set(reqs.map(groupOf)).size;
  const byFormat = {};
  let sampledProbes = 0;
  for (const r of sampled) {
    byFormat[r.format] = (byFormat[r.format] ?? 0) + 1;
    if (isProbe(r.path)) sampledProbes++;
  }
  console.error(`lines read  ${lines}\nkept        ${reqs.length} (probes ${probes}, one shape per format)\ngroups      ${groups}\nsampled     ${sampled.length}, probes ${sampledProbes} (per shape ${perShape}, max groups ${maxGroups})`);
  console.error('sampled by format: ' + Object.entries(byFormat).map(([k, v]) => `${k} ${v}`).join(', '));
  console.error('skipped:');
  for (const [reason, count] of Object.entries(skipped).sort((a, b) => b[1] - a[1])) {
    console.error(`  ${String(count).padStart(8)}  ${reason}`);
  }
  process.stdout.write(JSON.stringify(sampled.map(r => [r.format, r.path]), null, 0) + '\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
