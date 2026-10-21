// Shared by run.mjs (parity) and perf.mjs (timing): command-line options, corpus loading and
// filtering, and a small HTTP client.
import { createHash } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { corpus } from './corpus.mjs';

export { hostFor } from './corpus.mjs';

export const DIR = fileURLToPath(new URL('.', import.meta.url));
// PARITY_CACHE lets several worktrees share one cache of live responses.
export const CACHE_ROOT = process.env.PARITY_CACHE || DIR + '.cache';
export const NODE_BASE = process.env.NODE_BASE || 'http://127.0.0.1:3101';
export const LIVE_SCHEME = process.env.LIVE_SCHEME || 'https';
export const USER_AGENT = 'scripture-guide-parity/1 (Chrome)';

export function cliOptions(args = process.argv.slice(2)) {
  const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  return {
    opt,
    flag: name => args.includes(name),
    formats: opt('--format')?.split(','),
    only: opt('--only'),
    // --corpus traffic: requests sampled from access logs by traffic.mjs, instead of the built-in list.
    corpusName: opt('--corpus') ?? 'builtin',
  };
}

export function loadCorpus(name) {
  if (name === 'builtin') return corpus;
  if (name !== 'traffic') { console.error(`unknown --corpus ${name} (builtin, traffic)`); process.exit(2); }
  const file = CACHE_ROOT + '/traffic.json';
  if (!existsSync(file)) {
    console.error(`${file} is missing. Build it from access logs first:\n  node test/parity/traffic.mjs <access.log…> > ${file}`);
    process.exit(2);
  }
  let list;
  try { list = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { list = e; }
  const valid = Array.isArray(list) &&
    list.every(r => Array.isArray(r) && r.length === 2 && typeof r[0] === 'string' && typeof r[1] === 'string');
  if (!valid) {
    console.error(`${file} is not a JSON array of [format, path] string pairs` + (list instanceof Error ? ` (${list.message})` : '') +
      '. Rebuild it with test/parity/traffic.mjs.');
    process.exit(2);
  }
  return list;
}

// The corpus requests that pass --format and --only.
export function selectRequests(requests, { formats, only } = {}) {
  return requests.filter(([format, path]) => (!formats || formats.includes(format)) && (!only || path.includes(only)));
}

// The diff file name for a failing request: the path made filename-safe and cut to 100
// characters, plus a hash of the whole request, so '/', '/~/' and '/?feed=rss2' stay apart.
export function diffName(format, path) {
  const slug = path.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 100);
  const hash = createHash('sha1').update(`${format} ${path}`).digest('hex').slice(0, 8);
  return `${format}__${slug}_${hash}`;
}

// Keep-alive agents, so repeated timed requests measure the server rather than TCP/TLS setup.
const agents = { http: new http.Agent({ keepAlive: true }), https: new https.Agent({ keepAlive: true }) };

export function get(url, headers = {}) {
  const secure = url.startsWith('https');
  const mod = secure ? https : http;
  return new Promise((resolve, reject) => {
    mod.get(url, { headers, timeout: 30000, agent: secure ? agents.https : agents.http }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({ status: res.statusCode, type: res.headers['content-type'] || '', buf, body: buf.toString('utf8') });
      });
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}
