/**
 * Guards the WIRING between fixtures on disk and the tests that run them.
 *
 * The loader globbed `test/fixtures/*.yml`, which matched only the flat
 * aggregated en.yml/ko.yml -- 25 cases. The real corpus lives in
 * `test/fixtures/<lang>/<fn>/<tier>.yml` and held 703 cases that nothing loaded.
 * detect.negative.test.js resolved to ZERO cases and passed silently, because
 * `describe.each([])` is a no-op: 45 false-positive guards reported green
 * without ever executing.
 *
 * A fixture that does not run is worse than no fixture -- it looks like coverage.
 * These tests fail when a file, a tier, or a case stops being reachable.
 */
import { readFileSync } from 'fs';
import { load as parse } from 'js-yaml';
import { loadFixtures, listFixtureFiles, getTestCases } from './fixture-loader.js';

const { aggregated, perTier } = listFixtureFiles();
const fixtures = loadFixtures();

/** Every (fn, tier) pair some test file actually consumes. */
const CONSUMED_TIERS = [
  ['lookup', 'critical'],
  ['lookup', 'edge_cases'],
  ['lookup', 'invalid'],
  ['lookup', 'known_issues'],
  ['lookup', 'numbered-books'],
  ['lookup', 'formats'],
  ['generate', 'critical'],
  ['generate', 'edge_cases'],
  ['detect', 'critical'],
  ['detect', 'edge_cases'],
  ['detect', 'negative'],
  ['detect', 'adversarial'],
];

const loadedTiers = () => {
  const out = [];
  for (const langFixture of fixtures) {
    for (const [fn, tiers] of Object.entries(langFixture)) {
      if (fn === 'language' || !tiers || typeof tiers !== 'object') continue;
      for (const [tier, cases] of Object.entries(tiers)) {
        if (Array.isArray(cases) && cases.length) out.push([fn, tier, cases.length]);
      }
    }
  }
  return out;
};

describe('fixture reachability', () => {
  test('both fixture layouts are found on disk', () => {
    expect(aggregated.length).toBeGreaterThan(0);
    expect(perTier.length).toBeGreaterThan(0);
  });

  test('every fixture file on disk contributes at least one loaded case', () => {
    const loadedIds = new Set();
    for (const [fn, tier] of loadedTiers()) {
      for (const tc of getTestCases(fixtures, fn, tier)) if (tc.id) loadedIds.add(tc.id);
    }

    const orphans = [];
    for (const file of perTier) {
      const doc = parse(readFileSync(file, 'utf8')) || {};
      const ids = (doc.tests || []).map(tc => tc.id).filter(Boolean);
      if (!ids.length) continue; // an empty file is a placeholder, not an orphan
      if (!ids.some(id => loadedIds.has(id))) orphans.push(file);
    }
    expect(orphans).toEqual([]);
  });

  test('no case on disk is dropped by the loader', () => {
    let onDisk = 0;
    const seen = new Set();
    for (const file of perTier) {
      const doc = parse(readFileSync(file, 'utf8')) || {};
      for (const tc of doc.tests || []) {
        if (tc.id && seen.has(tc.id)) continue;
        if (tc.id) seen.add(tc.id);
        onDisk++;
      }
    }
    const loaded = loadedTiers().reduce((sum, [, , n]) => sum + n, 0);
    // Loaded may exceed on-disk (ko lives only in the aggregated layout), but it
    // must never fall short -- that would mean cases silently vanished.
    expect(loaded).toBeGreaterThanOrEqual(onDisk);
  });

  test('every loaded tier has a test that consumes it', () => {
    const consumed = new Set(CONSUMED_TIERS.map(([fn, tier]) => `${fn}.${tier}`));
    const unconsumed = loadedTiers()
      .map(([fn, tier, n]) => [`${fn}.${tier}`, n])
      .filter(([key]) => !consumed.has(key));

    // A tier with no consumer is a silent hole: the cases load but nothing
    // asserts on them. Wire up a test, or fold the file into a consumed tier.
    expect(
      unconsumed.map(([key, n]) => `${key} (${n} cases load but no test reads this tier)`)
    ).toEqual([]);
  });

  test('detect negative cases are non-empty (they resolved to zero and passed silently)', () => {
    expect(getTestCases(fixtures, 'detect', 'negative').length).toBeGreaterThan(0);
  });
});
