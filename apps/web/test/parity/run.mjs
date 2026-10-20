#!/usr/bin/env node
// Parity harness: fetch each corpus request from the live PHP site and from the Node app,
// normalize both, and report per format.
//
//   NODE_BASE=http://127.0.0.1:3101 node test/parity/run.mjs [--corpus traffic] [--format api,meta] [--only john] [--refresh] [--verbose]
//
// The Node app must run against a full copy of the database (see test/parity/README.md).
import http from 'node:http';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { corpus, hostFor } from './corpus.mjs';
import { canonicalHtml, canonicalJson, canonicalAsset, mediaType, encodeCacheEntry, decodeCacheEntry, compare } from './normalize.mjs';

const DIR = fileURLToPath(new URL('.', import.meta.url));
// PARITY_CACHE lets several worktrees share one cache of live responses.
const CACHE_ROOT = process.env.PARITY_CACHE || DIR + '.cache';
const CACHE = CACHE_ROOT + '/live/';
const DIFFS = DIR + '.cache/diffs/';
const NODE_BASE = process.env.NODE_BASE || 'http://127.0.0.1:3101';
const LIVE_SCHEME = process.env.LIVE_SCHEME || 'https';

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const formats = opt('--format')?.split(',');
const only = opt('--only');
const refresh = args.includes('--refresh');
const verbose = args.includes('--verbose');
// --corpus traffic: requests sampled from access logs by traffic.mjs, instead of the built-in list.
const corpusName = opt('--corpus') ?? 'builtin';
const requests = loadCorpus(corpusName);
const allow = existsSync(DIR + 'allow.json') ? JSON.parse(readFileSync(DIR + 'allow.json', 'utf8')) : {};

function loadCorpus(name) {
  if (name === 'builtin') return corpus;
  if (name !== 'traffic') { console.error(`unknown --corpus ${name} (builtin, traffic)`); process.exit(2); }
  const file = CACHE_ROOT + '/traffic.json';
  if (!existsSync(file)) {
    console.error(`${file} is missing. Build it from access logs first:\n  node test/parity/traffic.mjs <access.log…> > ${file}`);
    process.exit(2);
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

mkdirSync(CACHE, { recursive: true });
rmSync(DIFFS, { recursive: true, force: true }); // stale diffs look like current failures
mkdirSync(DIFFS, { recursive: true });

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = (url.startsWith('https') ? import('node:https') : Promise.resolve(http)).then(mod =>
      mod.get(url, { headers, timeout: 30000 }, res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          resolve({ status: res.statusCode, type: res.headers['content-type'] || '', buf, body: buf.toString('utf8') });
        });
      }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); }));
    req.catch(reject);
  });
}

async function live(format, path) {
  const url = `${LIVE_SCHEME}://${hostFor(format)}${path}`;
  const file = CACHE + createHash('sha1').update(url).digest('hex') + '.json';
  if (!refresh && existsSync(file)) return decodeCacheEntry(JSON.parse(readFileSync(file, 'utf8')));
  await new Promise(r => setTimeout(r, 250));
  const res = await get(url, { 'User-Agent': 'scripture-guide-parity/1 (Chrome)' });
  writeFileSync(file, JSON.stringify(encodeCacheEntry(res)));
  return res;
}

function local(format, path) {
  return get(NODE_BASE + path, { Host: hostFor(format), 'User-Agent': 'scripture-guide-parity/1 (Chrome)' });
}

function canonical(format, res) {
  const body = res.body.replace(/\r\n/g, '\n');
  switch (format) {
    case 'html': {
      const $ = cheerio.load(body);
      const title = collapse($('title').text());
      const container = $('#container').length ? canonicalHtml(body, '#container') : canonicalHtml(body, 'body');
      return `TITLE ${title}\n${container}`;
    }
    case 'api': {
      // ?output_only returns the HTML as a bare JSON string.
      const parsed = JSON.parse(body);
      return typeof parsed === 'string' ? canonicalHtml(parsed) : canonicalJson(body, ['output']);
    }
    case 'meta':
    case 'raw': return canonicalJson(body);
    case 'passage':
    case 'versionselect':
    case 'vbox':
    case 'notes': return canonicalHtml(body);
    case 'asset': {
      const type = mediaType(res.type);
      return `TYPE ${type}\n` + canonicalAsset(type, res.buf);
    }
    default: return body.replace(/[ \t]+$/gm, '');
  }
}
const collapse = s => s.replace(/\s+/g, ' ').trim();

function safe(format, res) {
  try { return canonical(format, res); } catch (e) { return `UNPARSEABLE (${e.message})\n${res.body.slice(0, 500)}`; }
}

const results = [];
for (const [format, path] of requests) {
  if (formats && !formats.includes(format)) continue;
  if (only && !path.includes(only)) continue;
  const key = `${format} ${path}`;
  let expected, actual, verdict;
  try {
    const [l, n] = [await live(format, path), await local(format, path)];
    expected = `STATUS ${l.status}\n` + safe(format, l);
    actual = `STATUS ${n.status}\n` + safe(format, n);
    const c = compare(expected, actual);
    verdict = c.equal ? 'pass' : allow[key] ? 'allowed' : 'fail';
    if (!c.equal) {
      // long traffic paths would overflow the filename limit: truncate and add a hash
      let name = `${format}__${path.replace(/[^a-z0-9]+/gi, '_')}`;
      if (name.length > 120) name = name.slice(0, 100) + '_' + createHash('sha1').update(key).digest('hex').slice(0, 12);
      writeFileSync(DIFFS + name + '.live.txt', expected);
      writeFileSync(DIFFS + name + '.node.txt', actual);
    }
    results.push({ key, format, verdict, diff: c, reason: allow[key] });
  } catch (e) {
    results.push({ key, format, verdict: 'error', diff: { error: e.message } });
  }
}

const byFormat = {};
for (const r of results) {
  const f = (byFormat[r.format] ??= { pass: 0, allowed: 0, fail: 0, error: 0 });
  f[r.verdict]++;
}
console.log('format         pass allowed fail error');
for (const [f, c] of Object.entries(byFormat)) {
  console.log(`${f.padEnd(14)} ${String(c.pass).padStart(4)} ${String(c.allowed).padStart(7)} ${String(c.fail).padStart(4)} ${String(c.error).padStart(5)}`);
}
for (const r of results.filter(r => r.verdict === 'fail' || r.verdict === 'error')) {
  const d = r.diff;
  console.log(`\n✗ ${r.key}` + (d.error ? `  ERROR ${d.error}` : `  line ${d.line}\n    live: ${(d.expected ?? '').slice(0, 200)}\n    node: ${(d.actual ?? '').slice(0, 200)}`));
  if (!verbose && results.filter(x => x.verdict === 'fail').indexOf(r) >= 30) { console.log('\n… (use --verbose for all)'); break; }
}
console.log(`\nDiffs: ${DIFFS}`);
process.exitCode = results.some(r => r.verdict === 'fail' || r.verdict === 'error') ? 1 : 0;
