#!/usr/bin/env node
// Do Sphinx and the MySQL fallback find the same verses? Two SearchService instances, one on
// Sphinx (through SphinxClient.search) and one on the MySQL fallback, run the same hits() calls
// for each query and the verse ids are compared, in the three shapes production search() uses:
//   - per version: hits(q, [version]) for each of --versions, compared as sets;
//   - first pass: hits(q, all searchable versions, { stopAfter: REQUERY_OVER }), the call
//     search() makes first (FIRST_PAGE pages on the fallback);
//   - requery: when a first pass goes past REQUERY_OVER, hits(q, ['LDS', 'KJV'], { range }) for
//     each BOOK_RANGES range, which the fallback prefilters differently (LIKE, verse_id BETWEEN).
//
//   MYSQL_HOST=… SPHINX_HOST=… node test/integration/sphinx-vs-fallback.mjs [--queries 'a,b'] [--versions KJV,ASV,WEB]
//
// In CI it runs inside the web-sphinx container (docker exec), which has MYSQL_HOST=db and
// SPHINX_HOST=sphinx. The search page cannot be compared over HTTP for this: it shows one version
// per verse and requeries only LDS/KJV past 300 hits, so per-version sets are not on the page.
//
// Both sides read everything: Sphinx with OPTION max_matches raised past searchd's default 1000
// (production sends none; counts above 1000 are noted), the fallback with no time or row budget,
// and the requery without production's 5000-per-range limit (counts above it are noted).
// Exits 1 when a query differs, 2 on an error; differences for queries made only of quoted phrases
// are reported but do not fail.
import searchRepository from '../../src/data/repositories/SearchRepository.js';
import { SearchService, REQUERY_OVER, BOOK_RANGES } from '../../src/services/SearchService.js';
import { createSphinxClient } from '../../src/data/external/sphinx.js';
import db from '../../src/data/db/connection.js';
import config from '../../src/config/index.js';
import { diffSets, hasDifference, isPhrase, formatQuery, shownPairs, firstPass } from './sphinxDiff.mjs';

const QUERIES = [
  'loved', 'love', 'loving', 'charity', 'faith hope charity', 'in the beginning', 'beginning',
  'water', 'waters', 'lord god', "lord's", 'days', 'begat', 'unto', 'went up', 'jesus wept',
  'heaven and earth', 'children of israel', 'godly', 'earthly things', 'holy', 'only', 'daily',
  '"faith hope" charity',
  '"in the beginning"', '"faith hope"', '"the lord"',
];
const SPHINX_DEFAULT_MAX_MATCHES = 1000;
const REQUERY_LIMIT = 5000; // production's limit per requery range
const MAX_MATCHES = 100000;
const REQUERY_VERSIONS = ['LDS', 'KJV'];

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const queries = opt('--queries')?.split(',').map(s => s.trim()).filter(Boolean) ?? QUERIES;
const versions = (opt('--versions') ?? 'KJV,ASV,WEB').split(',').map(s => s.trim().toUpperCase());

const client = createSphinxClient(config.sphinx);
if (!client) { console.error('SPHINX_HOST is not set'); process.exit(2); }

// SphinxClient.search with searchd's cap raised; everything else as production sends it
const sphinx = new SearchService(searchRepository, { search: (q, o) => client.search(q, { ...o, maxMatches: MAX_MATCHES }) });
const fallback = new SearchService(searchRepository, null, { fallbackMaxMs: 1e9, fallbackMaxRows: Infinity });

// Both sides' hits for one hits() call; notes when production would see fewer
async function both(query, vers, opts, notes, where) {
  const s = await sphinx.hits(query, vers, opts);
  const budget = fallback.budget();
  const f = await fallback.hits(query, vers, { ...opts, budget });
  if (budget.truncated) notes.push(`${where}: fallback ran out of budget`);
  if (s.length > SPHINX_DEFAULT_MAX_MATCHES && !Number.isFinite(opts.stopAfter)) {
    notes.push(`${where}: Sphinx has ${s.length} hits; production's default max_matches keeps ${SPHINX_DEFAULT_MAX_MATCHES}`);
  }
  return [s, f];
}

async function textsFor(diff) {
  const rows = await searchRepository.texts(shownPairs(diff));
  return new Map(rows.map(r => [`${String(r.version).toUpperCase()}|${Number(r.verse_id)}`, r.text]));
}

// The comparisons for one query: [{ label, diff, notes }]
async function compare(query, allVersions) {
  const out = [];

  const notes = [], s = [], f = [];
  for (const version of versions) {
    const [sh, fh] = await both(query, [version], { limit: MAX_MATCHES }, notes, version);
    s.push(...sh);
    f.push(...fh);
  }
  out.push({ label: 'per version', diff: diffSets(s, f, versions), notes });

  const firstNotes = [];
  const [s1, f1] = await both(query, allVersions, { stopAfter: REQUERY_OVER }, firstNotes, 'first pass');
  const first = firstPass(s1, f1, allVersions, REQUERY_OVER);
  out.push({ label: `first pass, ${allVersions.join(' ')}`, diff: first.diff, notes: [...firstNotes, ...first.notes] });

  if (first.requery) {
    for (const range of BOOK_RANGES) {
      const where = `requery ${range[0]}-${range[1]}`;
      const rnotes = [];
      const [sr, fr] = await both(query, REQUERY_VERSIONS, { range, limit: MAX_MATCHES }, rnotes, where);
      for (const [side, hits] of [['Sphinx', sr], ['fallback', fr]]) {
        if (hits.length > REQUERY_LIMIT) rnotes.push(`${where}: ${side} has ${hits.length} hits; production keeps ${REQUERY_LIMIT}`);
      }
      out.push({ label: where, diff: diffSets(sr, fr, REQUERY_VERSIONS), notes: rnotes });
    }
  }
  return out;
}

let failed = 0, phraseDiffs = 0;
const phraseLines = [];
try {
  const allVersions = await searchRepository.searchableVersions();
  for (const query of queries) {
    const lines = [];
    let differs = false;
    for (const c of await compare(query, allVersions)) {
      if (hasDifference(c.diff)) differs = true;
      lines.push(...formatQuery({ query, label: c.label, diff: c.diff, texts: await textsFor(c.diff), notes: c.notes }));
    }
    if (!differs) console.log(lines.join('\n'));
    else if (isPhrase(query)) { phraseDiffs++; phraseLines.push(...lines); }
    else { failed++; console.log(lines.join('\n')); }
  }
  if (phraseLines.length) {
    console.log('\nQuoted phrases (informational; phrase semantics may differ on purpose):');
    console.log(phraseLines.join('\n'));
  }
  console.log(`\n${queries.length} queries: ${failed} plain ${failed === 1 ? 'query differs' : 'queries differ'}, ${phraseDiffs} phrase ${phraseDiffs === 1 ? 'query differs' : 'queries differ'}`);
  if (failed) process.exitCode = 1;
} catch (err) {
  console.error(err);
  process.exitCode = 2;
} finally {
  // A failed close is reported and must not replace the exit code with an unhandled rejection
  for (const close of [() => client.close(), () => db.closePool()]) {
    try { await close(); } catch (err) { console.error(`cleanup: ${err.message}`); }
  }
}
