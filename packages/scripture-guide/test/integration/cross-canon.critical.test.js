// Cross-canon concordance: normal paths (LDS <-> RLDS/COC)
// Contract: docs/reference/cross-canon-concordance.md
// Plain integer verse_ids in each canon's own id space.
//
// Ground truth from data/canons/rlds/_mapping.yml via src/lib/mapping-loader.mjs:
//   lds 31104 (1 Nephi 1:2)  <-> rlds 31336 (1 Nephi 1:3)      1:1
//   lds 31153 (1 Nephi 3:7)  <-> rlds 31400-31401 (1 Ne 1:67-68) 1:2 split
//   lds 31103 (1 Nephi 1:1)  <-> rlds 31334-31335 (1 Ne 1:1-2)   1:2 split
//   lds 1     (Genesis 1:1)  <-> rlds 3 (JST Genesis 1:3)       1:1 (JST adds 2 verses)

import { lookupReference, generateReference, convertCanon } from '../../dist/scriptures.mjs';

describe('convertCanon - LDS <-> RLDS', () => {
  test('converts a 1:1 mapped verse from lds to rlds', () => {
    const result = convertCanon([31104], { from: 'lds', to: 'rlds' });
    expect(result.verse_ids).toEqual([31336]);
    expect(result.partial).toBe(false);
    expect(result.error).toBeUndefined();
  });

  test('converts a 1:1 mapped verse from rlds to lds', () => {
    const result = convertCanon([31401], { from: 'rlds', to: 'lds' });
    expect(result.verse_ids).toEqual([31153]);
    expect(result.partial).toBe(false);
  });

  test('flags partial when one lds verse spans two rlds verses', () => {
    const result = convertCanon([31153], { from: 'lds', to: 'rlds' });
    expect(result.verse_ids).toEqual([31400, 31401]);
    expect(result.partial).toBe(true);
  });

  test('dedupes when two rlds verses map into one lds verse', () => {
    const result = convertCanon([31334, 31335], { from: 'rlds', to: 'lds' });
    expect(result.verse_ids).toEqual([31103]);
  });

  test('converts JST/bible portion (lds bible ids <-> rlds JST ids)', () => {
    // KJV Genesis 1:1 (lds id 1) -> JST Genesis 1:3 (rlds id 3)
    const result = convertCanon([1], { from: 'lds', to: 'rlds' });
    expect(result.verse_ids).toEqual([3]);
    expect(result.partial).toBe(false);
  });

  test('round-trips a 1:1 verse lds -> rlds -> lds', () => {
    const there = convertCanon([31104], { from: 'lds', to: 'rlds' });
    const back = convertCanon(there.verse_ids, { from: 'rlds', to: 'lds' });
    expect(back.verse_ids).toEqual([31104]);
    expect(back.partial).toBe(false);
  });

  test('converts a contiguous range preserving order', () => {
    // lds 1 Nephi 3:7-9 (31153-31155)
    const result = convertCanon([31153, 31154, 31155], { from: 'lds', to: 'rlds' });
    expect(result.verse_ids).toEqual([31400, 31401, 31402, 31403]);
    expect(result.partial).toBe(true); // 31153 is a 1:2 split
  });
});

describe('lookupReference - canon: rlds', () => {
  test('parses with RLDS versification and returns rlds ids', () => {
    // RLDS 1 Nephi 1:67 — verse 67 only exists in RLDS chaptering
    const result = lookupReference('1 Nephi 1:67', { canon: 'rlds' });
    expect(result.verse_ids).toEqual([31400]);
  });

  test('renders ref in RLDS versification', () => {
    const result = lookupReference('1 Nephi 1:67', { canon: 'rlds' });
    expect(result.ref).toBe('1 Nephi 1:67');
  });

  test('handles verse numbers far beyond LDS chapter sizes', () => {
    // RLDS 1 Nephi 1 has 174 verses (LDS 1 Nephi 1 has 20)
    const result = lookupReference('1 Nephi 1:174', { canon: 'rlds' });
    expect(result.verse_ids).toEqual([31507]);
  });

  test('handles ranges in RLDS coordinates', () => {
    const result = lookupReference('1 Nephi 1:67-68', { canon: 'rlds' });
    expect(result.verse_ids).toEqual([31400, 31401]);
  });

  test('default canon lookups are unaffected', () => {
    const result = lookupReference('1 Nephi 3:7');
    expect(result.verse_ids).toEqual([31153]);
    expect(result.ref).toBe('1 Nephi 3:7');
  });
});

describe('lookupReference - convertTo', () => {
  test('looks up in lds and converts to rlds', () => {
    const result = lookupReference('1 Nephi 3:7', { convertTo: 'rlds' });
    expect(result.verse_ids).toEqual([31400, 31401]);
    expect(result.partial).toBe(true);
    expect(result.sourceCanon).toBe('lds');
  });

  test('renders converted ref in target-canon versification', () => {
    const result = lookupReference('1 Nephi 3:7', { convertTo: 'rlds' });
    expect(result.ref).toBe('1 Nephi 1:67-68');
  });

  test('looks up in rlds and converts to lds', () => {
    const result = lookupReference('1 Nephi 1:67-68', { canon: 'rlds', convertTo: 'lds' });
    expect(result.verse_ids).toEqual([31153]);
    expect(result.ref).toBe('1 Nephi 3:7');
  });
});

describe('generateReference - canon: rlds', () => {
  test('renders rlds ids in RLDS versification', () => {
    expect(generateReference([31400, 31401], { canon: 'rlds' })).toBe('1 Nephi 1:67-68');
  });

  test('renders a single rlds verse', () => {
    expect(generateReference([31334], { canon: 'rlds' })).toBe('1 Nephi 1:1');
  });

  test('renders JST portion ids under rlds canon', () => {
    // rlds id 3 = JST Genesis 1:3
    expect(generateReference([3], { canon: 'rlds' })).toBe('Genesis 1:3');
  });

  test('default canon generation is unaffected', () => {
    expect(generateReference([31153])).toBe('1 Nephi 3:7');
  });
});
