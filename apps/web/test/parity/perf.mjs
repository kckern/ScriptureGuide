#!/usr/bin/env node
// Response times of the Node app against the live PHP site, request by request.
//
//   NODE_BASE=http://127.0.0.1:3101 node test/parity/perf.mjs [--corpus traffic] [--format api,meta] [--only john]
//     [--runs 5] [--max-live 200] [--refresh-live] [--json out.json]
//
// Each URL gets one warm-up and --runs timed sequential requests on each side (time to the last
// byte). Live requests are spaced at least 250 ms apart, capped at --max-live in total (warm-ups
// included), and their times are cached in .cache/perf-live.json; --refresh-live refetches.
// Run against a local app and database, the numbers are indicative only: a laptop and a local
// copy of the database are not the production host.
import { performance } from 'node:perf_hooks';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { CACHE_ROOT, NODE_BASE, LIVE_SCHEME, USER_AGENT, cliOptions, loadCorpus, selectRequests, get, hostFor } from './harness.mjs';
import { report, cachedLive, FLAG_RATIO, FLAG_MS } from './perfStats.mjs';

const LIVE_GAP_MS = 250;
const LIVE_CACHE = CACHE_ROOT + '/perf-live.json';

const cli = cliOptions();
const runs = Number(cli.opt('--runs') ?? 5);
const maxLive = Number(cli.opt('--max-live') ?? 200);
const refreshLive = cli.flag('--refresh-live');
const jsonOut = cli.opt('--json');
if (!(runs >= 1) || !(maxLive >= 0)) { console.error('--runs must be >= 1 and --max-live >= 0'); process.exit(2); }

const requests = selectRequests(loadCorpus(cli.corpusName), cli);
mkdirSync(CACHE_ROOT, { recursive: true });
const liveCache = existsSync(LIVE_CACHE) ? JSON.parse(readFileSync(LIVE_CACHE, 'utf8')) : {};

async function timed(url, headers) {
  const start = performance.now();
  const res = await get(url, { 'User-Agent': USER_AGENT, ...headers });
  const ms = performance.now() - start;
  return { ms, status: res.status };
}

async function series(url, headers, { gap = 0 } = {}) {
  const times = [];
  let status;
  for (let i = 0; i <= runs; i++) { // i = 0 is the warm-up
    if (gap && i) await new Promise(r => setTimeout(r, gap));
    const t = await timed(url, headers);
    status = t.status;
    if (i) times.push(Math.round(t.ms * 10) / 10);
  }
  return { times, status };
}

let liveSpent = 0;
let liveSkipped = 0;
let lastLive = 0;
async function liveTimes(format, path) {
  const url = `${LIVE_SCHEME}://${hostFor(format)}${path}`;
  const cached = cachedLive(liveCache, url, runs, { refresh: refreshLive });
  if (cached) return cached;
  if (liveSpent + runs + 1 > maxLive) { liveSkipped++; return null; }
  const wait = lastLive + LIVE_GAP_MS - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  liveSpent += runs + 1;
  try {
    const { times } = await series(url, {}, { gap: LIVE_GAP_MS });
    liveCache[url] = { at: new Date().toISOString(), times };
    writeFileSync(LIVE_CACHE, JSON.stringify(liveCache, null, 1));
    return times;
  } catch (e) {
    console.error(`live ${url}: ${e.message}`);
    return null;
  } finally {
    lastLive = Date.now();
  }
}

const results = [];
for (const [format, path] of requests) {
  let node;
  try {
    node = (await series(NODE_BASE + path, { Host: hostFor(format) })).times;
  } catch (e) {
    console.error(`node ${format} ${path}: ${e.message}`);
    continue;
  }
  const live = await liveTimes(format, path);
  results.push({ format, path, node, live });
  process.stderr.write('.');
}
process.stderr.write('\n');

const r = report(results);
const ms = v => (v == null ? '-' : Math.round(v).toString());
const x = v => (v == null ? '-' : v.toFixed(2));
const row = (name, g, n) => `${name.padEnd(14)} ${String(n).padStart(4)} ${ms(g.node.p50).padStart(8)} ${ms(g.node.p95).padStart(8)} ` +
  `${ms(g.live.p50).padStart(8)} ${ms(g.live.p95).padStart(8)} ${x(g.ratio).padStart(6)} ${String(g.flagged).padStart(7)}`;

console.log(`${runs} runs per URL, median per URL; p50/p95 across URLs, in ms. Ratio = Node p50 / live p50 over URLs timed on both.`);
console.log('format         urls node p50 node p95 live p50 live p95  ratio flagged');
for (const [f, g] of Object.entries(r.formats)) console.log(row(f, g, r.urls.filter(u => u.format === f).length));
console.log(row('overall', r.overall, r.urls.length));

const flagged = r.urls.filter(u => u.flagged);
console.log(`\nFlagged (Node p50 > ${FLAG_RATIO}x live and > ${FLAG_MS} ms slower): ${flagged.length}`);
for (const u of flagged) console.log(`  ${u.format.padEnd(8)} ${u.path}  node ${ms(u.node)}  live ${ms(u.live)}`);
console.log('\nSlowest on Node:');
for (const u of [...r.urls].sort((a, b) => b.node - a.node).slice(0, 10)) {
  console.log(`  ${ms(u.node).padStart(6)}  live ${ms(u.live).padStart(6)}  ${u.format.padEnd(8)} ${u.path}`);
}
console.log(`\nLive: ${liveSpent} requests made, ${liveSkipped} URLs without live times (--max-live ${maxLive}).`);

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ at: new Date().toISOString(), nodeBase: NODE_BASE, corpus: cli.corpusName, runs, ...r, results }, null, 1));
  console.log(`JSON: ${jsonOut}`);
}
