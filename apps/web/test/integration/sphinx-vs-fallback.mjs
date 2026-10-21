#!/usr/bin/env node
// Do Sphinx and the MySQL fallback find the same verses? Runs SearchService.hits() through both
// backends for each query and compares the sets of verse ids per version.
//
//   MYSQL_HOST=… SPHINX_HOST=… node test/integration/sphinx-vs-fallback.mjs [--queries 'a,b'] [--versions KJV,ASV,WEB]
//
// In CI it runs inside the web-sphinx container (docker exec), which has MYSQL_HOST=db and
// SPHINX_HOST=sphinx. The search page cannot be compared over HTTP for this: it shows one version
// per verse and requeries only LDS/KJV past 300 hits, so per-version sets are not on the page.
//
// Both sides read everything: Sphinx with OPTION max_matches raised past searchd's default 1000
// (production sends none; counts above 1000 are noted), the fallback with no time or row budget.
// Exits 1 when a plain query differs; quoted-phrase differences are reported but do not fail.
import searchRepository from '../../src/data/repositories/SearchRepository.js';
import { SearchService } from '../../src/services/SearchService.js';
import { buildSearchSql, createSphinxClient } from '../../src/data/external/sphinx.js';
import db from '../../src/data/db/connection.js';
import config from '../../src/config/index.js';
import { diffSets, hasDifference, isPhrase, formatQuery, shownPairs } from './sphinxDiff.mjs';

const QUERIES = [
  'loved', 'love', 'loving', 'charity', 'faith hope charity', 'in the beginning', 'beginning',
  'water', 'waters', 'lord god', "lord's", 'days', 'begat', 'unto', 'went up', 'jesus wept',
  'heaven and earth', 'children of israel',
  '"in the beginning"', '"faith hope"', '"the lord"',
];
const SPHINX_DEFAULT_MAX_MATCHES = 1000;
const MAX_MATCHES = 100000;

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const queries = opt('--queries')?.split(',').map(s => s.trim()).filter(Boolean) ?? QUERIES;
const versions = (opt('--versions') ?? 'KJV,ASV,WEB').split(',').map(s => s.trim().toUpperCase());

const sphinx = createSphinxClient(config.sphinx);
if (!sphinx) { console.error('SPHINX_HOST is not set'); process.exit(2); }

// Sphinx hits for one version, past the default max_matches
async function sphinxHits(query, version) {
  const sql = `${buildSearchSql(query, { versions: [version], limit: MAX_MATCHES })} OPTION max_matches=${MAX_MATCHES}`;
  const rows = await sphinx.query(sql);
  return rows.map(r => ({ verse_id: Number(r.verse_id), version: String(r.version) }));
}

const fallback = new SearchService(searchRepository, null, { fallbackMaxMs: 1e9, fallbackMaxRows: Infinity });

let failed = 0, phraseDiffs = 0;
const phraseLines = [];
try {
  for (const query of queries) {
    const notes = [];
    const s = [], f = [];
    for (const version of versions) {
      const sh = await sphinxHits(query, version);
      if (sh.length > SPHINX_DEFAULT_MAX_MATCHES) notes.push(`${version}: Sphinx has ${sh.length} hits; production's default max_matches keeps ${SPHINX_DEFAULT_MAX_MATCHES} per query`);
      s.push(...sh);
      const budget = fallback.budget();
      f.push(...await fallback.hits(query, [version], { limit: MAX_MATCHES, budget }));
      if (budget.truncated) notes.push(`${version}: fallback ran out of budget`);
    }
    const diff = diffSets(s, f, versions);
    const pairs = shownPairs(diff);
    const texts = new Map((await searchRepository.texts(pairs)).map(r => [`${String(r.version).toUpperCase()}|${Number(r.verse_id)}`, r.text]));
    const lines = formatQuery({ query, diff, texts, notes });
    if (!hasDifference(diff)) console.log(lines.join('\n'));
    else if (isPhrase(query)) { phraseDiffs++; phraseLines.push(...lines); }
    else { failed++; console.log(lines.join('\n')); }
  }
  if (phraseLines.length) {
    console.log('\nQuoted phrases (informational; phrase semantics may differ on purpose):');
    console.log(phraseLines.join('\n'));
  }
} catch (err) {
  console.error(err);
  process.exitCode = 2;
} finally {
  await sphinx.close();
  await db.closePool();
}

if (process.exitCode !== 2) {
  console.log(`\n${queries.length} queries over ${versions.join(', ')}: ${failed} plain ${failed === 1 ? 'query differs' : 'queries differ'}, ${phraseDiffs} phrase ${phraseDiffs === 1 ? 'query differs' : 'queries differ'}`);
  if (failed) process.exitCode = 1;
}
