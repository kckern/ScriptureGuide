#!/usr/bin/env node
// Parity harness: fetch each corpus request from the live PHP site and from the Node app,
// normalize both, and report per format.
//
//   NODE_BASE=http://127.0.0.1:3101 node test/parity/run.mjs [--corpus traffic] [--format api,meta] [--only john] [--refresh] [--verbose]
//
// The Node app must run against a full copy of the database (see test/parity/README.md).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import * as cheerio from 'cheerio';
import { DIR, CACHE_ROOT, NODE_BASE, LIVE_SCHEME, USER_AGENT, cliOptions, loadCorpus, selectRequests, get, hostFor, diffName } from './harness.mjs';
import { canonicalHtml, canonicalJson, canonicalAsset, mediaType, encodeCacheEntry, decodeCacheEntry, compare, homeCleanups, rawSearchterm } from './normalize.mjs';
import { allowReason } from './allow.mjs';

const CACHE = CACHE_ROOT + '/live/';
const DIFFS = DIR + '.cache/diffs/';

const cli = cliOptions();
const refresh = cli.flag('--refresh');
const verbose = cli.flag('--verbose');
const requests = selectRequests(loadCorpus(cli.corpusName), cli);
const allow = existsSync(DIR + 'allow.json') ? JSON.parse(readFileSync(DIR + 'allow.json', 'utf8')) : {};

mkdirSync(CACHE, { recursive: true });
rmSync(DIFFS, { recursive: true, force: true }); // stale diffs look like current failures
mkdirSync(DIFFS, { recursive: true });

async function live(format, path) {
  const url = `${LIVE_SCHEME}://${hostFor(format)}${path}`;
  const file = CACHE + createHash('sha1').update(url).digest('hex') + '.json';
  if (!refresh && existsSync(file)) return decodeCacheEntry(JSON.parse(readFileSync(file, 'utf8')));
  await new Promise(r => setTimeout(r, 250));
  const res = await get(url, { 'User-Agent': USER_AGENT });
  writeFileSync(file, JSON.stringify(encodeCacheEntry(res)));
  return res;
}

function local(format, path) {
  return get(NODE_BASE + path, { Host: hostFor(format), 'User-Agent': USER_AGENT });
}

function canonical(format, res) {
  const body = res.body.replace(/\r\n/g, '\n');
  switch (format) {
    case 'html': {
      const page = rawSearchterm(body);
      const $ = cheerio.load(page);
      const title = collapse($('title').text());
      const container = $('#container').length ? canonicalHtml(page, '#container') : canonicalHtml(page, 'body');
      return `TITLE ${title}\n${homeCleanups(container)}`;
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
  const key = `${format} ${path}`;
  let expected, actual, verdict;
  try {
    const [l, n] = [await live(format, path), await local(format, path)];
    expected = `STATUS ${l.status}\n` + safe(format, l);
    actual = `STATUS ${n.status}\n` + safe(format, n);
    const c = compare(expected, actual);
    const reason = allowReason(allow, format, path, l.body);
    verdict = c.equal ? 'pass' : reason ? 'allowed' : 'fail';
    if (!c.equal) {
      const name = diffName(format, path);
      writeFileSync(DIFFS + name + '.live.txt', expected);
      writeFileSync(DIFFS + name + '.node.txt', actual);
    }
    results.push({ key, format, verdict, diff: c, reason });
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
