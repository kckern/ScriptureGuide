import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { findViolations, versionsInSeed, pairsInSeed } from './check-seeds.mjs';
import { buildSelect } from './export-seed.mjs';

const manifest = { publicVersions: ['KJV'], tables: { scripture_verses: { scope: 'version', versionColumn: 'version' } } };

test('accepts a seed whose versions are all public', () => {
  assert.deepEqual(findViolations(manifest, { scripture_verses: ['KJV'] }), []);
});

test('rejects a seed containing a non-public version', () => {
  assert.deepEqual(findViolations(manifest, { scripture_verses: ['KJV', 'NIV'] }), ['scripture_verses: NIV is not in publicVersions']);
});

test('rejects a seed file for a table missing from the manifest', () => {
  assert.deepEqual(findViolations(manifest, { scripture_headings: [] }), ['scripture_headings: not in manifest']);
});

test('the real manifest lists no licensed or held-back version', () => {
  const real = JSON.parse(readFileSync(new URL('../../data/seeds/manifest.json', import.meta.url), 'utf8'));
  // GNV and WYC in the private database are modern-spelling editions, held for the owner.
  const held = ['NIV', 'ESV', 'NRSV', 'NASB', 'NLT', 'NKJV', 'RSV', 'LDS', '1981', '2013', 'GNV', 'WYC', 'printer', 'EARLIEST'];
  assert.deepEqual(real.publicVersions.filter(v => held.includes(v)), []);
});

test('every version-scoped table in the real manifest is checked against publicVersions', () => {
  const real = JSON.parse(readFileSync(new URL('../../data/seeds/manifest.json', import.meta.url), 'utf8'));
  for (const t of ['scripture_versions', 'scripture_verses', 'scripture_headings']) assert.equal(real.tables[t]?.scope, 'version', t);
});

test('reads the leading version value of every row tuple', () => {
  const sql = "INSERT INTO `scripture_verses` (`version`,`id`) VALUES\n('KJV',1),\n('NIV',2);\nINSERT INTO `scripture_verses` (`version`,`id`) VALUES\n('KJV',3);\n";
  assert.deepEqual(versionsInSeed(sql).sort(), ['KJV', 'NIV']);
});

// scripture_references holds the owner's own cross-reference sets next to the LDS footnote
// cross-references (© Intellectual Reserve), which must never be published.
const pairsManifest = {
  publicVersions: ['KJV'],
  tables: { scripture_references: { scope: 'pairs', pairColumns: ['type', 'source'], allow: [['JST', 'JST'], ['BoM', 'Quotes']] } },
};

test('accepts reference rows whose (type, source) pair is allowed', () => {
  assert.deepEqual(findViolations(pairsManifest, { scripture_references: [['JST', 'JST'], ['BoM', 'Quotes']] }), []);
});

test('rejects LDS footnote cross-references', () => {
  assert.deepEqual(findViolations(pairsManifest, { scripture_references: [['JST', 'JST'], ['xref', 'footnote']] }),
    ['scripture_references: (xref, footnote) is not an allowed pair']);
});

test('reads the leading two values of every row tuple', () => {
  const sql = "INSERT INTO `scripture_references` (`type`,`source`,`src_verse_id`) VALUES\n('JST','JST',1),\n('xref','footnote',2);\n";
  assert.deepEqual(pairsInSeed(sql), [['JST', 'JST'], ['xref', 'footnote']]);
});

test('the export selects only the allowed pairs, with the pair columns first', () => {
  const { sql, params, cols } = buildSelect('scripture_references', pairsManifest.tables.scripture_references,
    ['src_verse_id', 'type', 'source', 'notes'], ['KJV']);
  assert.deepEqual(cols, ['type', 'source', 'src_verse_id', 'notes']);
  assert.match(sql, /WHERE \(`type`, `source`\) IN \(\(\?, \?\), \(\?, \?\)\)/);
  assert.deepEqual(params, ['JST', 'JST', 'BoM', 'Quotes']);
});

test('the real manifest publishes only the owner-compiled reference sets', () => {
  const real = JSON.parse(readFileSync(new URL('../../data/seeds/manifest.json', import.meta.url), 'utf8'));
  const allow = real.tables.scripture_references?.allow ?? [];
  assert.deepEqual(allow.map(p => p.join('/')).sort(),
    ['1835/concordance', 'BOC/concordance', 'BoM/Allusions', 'BoM/Quotes', 'JST/JST']);
});
