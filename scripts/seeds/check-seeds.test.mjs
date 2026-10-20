import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findViolations, versionsInSeed } from './check-seeds.mjs';

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

test('reads the leading version value of every row tuple', () => {
  const sql = "INSERT INTO `scripture_verses` (`version`,`id`) VALUES\n('KJV',1),\n('NIV',2);\nINSERT INTO `scripture_verses` (`version`,`id`) VALUES\n('KJV',3);\n";
  assert.deepEqual(versionsInSeed(sql).sort(), ['KJV', 'NIV']);
});
