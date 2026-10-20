import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSelect } from './export-seed.mjs';

test('version scope puts the version column first and filters', () => {
  const { sql, params, cols } = buildSelect('scripture_verses', { scope: 'version', versionColumn: 'version' }, ['id', 'version', 'text'], ['KJV']);
  assert.equal(sql, 'SELECT `version`, `id`, `text` FROM `scripture_verses` WHERE `version` IN (?) ORDER BY 1, 2');
  assert.deepEqual(params, [['KJV']]);
  assert.deepEqual(cols, ['version', 'id', 'text']);
});

test('blank columns export as empty strings so NOT NULL text columns stay valid', () => {
  const { sql } = buildSelect('lds_scriptures_verses', { scope: 'all', blank: ['verse_scripture'] }, ['verse_id', 'verse_scripture', 'verse_title'], []);
  assert.equal(sql, "SELECT `verse_id`, '' AS `verse_scripture`, `verse_title` FROM `lds_scriptures_verses` ORDER BY 1");
});
