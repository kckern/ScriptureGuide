import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { snowballStem } from '../../src/services/search/snowballEnglish.js';
import { stemPrefix } from '../../src/services/search/matcher.js';

// Pairs printed by Sphinx stem_en: witnesses for each SPHINX rule switch, stemPrefix edge cases
// and a sample of the seed vocabulary (test/fixtures/stem-sphinx.json says how it was made)
const { stems } = JSON.parse(readFileSync(new URL('../fixtures/stem-sphinx.json', import.meta.url), 'utf8'));
const pairs = Object.entries(stems);

describe('stem regression fixture from Sphinx stem_en', () => {
  test('has a few hundred pairs', () => {
    expect(pairs.length).toBeGreaterThan(300);
  });
  test('snowballStem with the SPHINX rules gives Sphinx\'s stem for every word', () => {
    expect(pairs.filter(([w, s]) => snowballStem(w) !== s)).toEqual([]);
  });
  test('every word starts with its stem\'s prefix', () => {
    expect(pairs.filter(([w, s]) => !w.startsWith(stemPrefix(s)))).toEqual([]);
  });
});
