/**
 * Unit tests for scriptures.mjs core functions
 */
import { lookupReference, generateReference } from '../../dist/scriptures.mjs';

describe('lookupReference - Chapter Ranges', () => {
  test('handles chapter range with comma and dash: Genesis 1,3-5', () => {
    const result = lookupReference('Genesis 1,3-5');
    // Should return verses from chapters 1, 3, 4, and 5 (NOT chapter 2)
    expect(result.verse_ids.length).toBeGreaterThan(0);
    // Genesis 1 has 31 verses, chapters 3-5 have varying counts
    // Exact: 31 (ch1) + 24 (ch3) + 26 (ch4) + 32 (ch5) = 113 verses
    expect(result.verse_ids.length).toBe(113);

    // Verify chapter 2 verses are NOT included (Genesis 2 starts at verse 32)
    // Genesis 2:1 = verse ID 32, Genesis 2:25 = verse ID 56
    const chapter2Start = 32;
    const chapter2End = 56;
    const hasChapter2Verses = result.verse_ids.some(id => id >= chapter2Start && id <= chapter2End);
    expect(hasChapter2Verses).toBe(false);
  });

  test('handles simple chapter range: Genesis 3-5', () => {
    const result = lookupReference('Genesis 3-5');
    expect(result.verse_ids.length).toBeGreaterThan(0);
    // Chapters 3, 4, 5 combined: 24 + 26 + 32 = 82 verses
    expect(result.verse_ids.length).toBe(82);
  });

  test('handles chapter list: Genesis 1,3,5', () => {
    const result = lookupReference('Genesis 1,3,5');
    expect(result.verse_ids.length).toBeGreaterThan(0);
    // 31 (ch1) + 24 (ch3) + 32 (ch5) = 87 verses
    expect(result.verse_ids.length).toBe(87);
  });
});

describe('lookupReference - Performance', () => {
  test('multiple lookups should be fast (cached)', () => {
    const start = Date.now();

    // First lookup - may be slower (cache miss)
    lookupReference('Genesis 1:1');

    // Subsequent lookups should be fast (cache hit)
    for (let i = 0; i < 100; i++) {
      lookupReference('John 3:16');
      lookupReference('Romans 8:28');
      lookupReference('Psalm 23:1');
    }

    const elapsed = Date.now() - start;
    // 300 lookups should complete in under 1 second with caching
    expect(elapsed).toBeLessThan(1000);
  });
});

describe('lookupReference - Bounds Safety', () => {
  test('handles excessively large ranges gracefully', () => {
    const start = Date.now();

    // This should not hang or crash
    const result = lookupReference('Genesis 1:1-999999');

    const elapsed = Date.now() - start;
    // Should complete quickly (bounded)
    expect(elapsed).toBeLessThan(1000);
    // Should return some results but be bounded
    expect(result.verse_ids.length).toBeLessThanOrEqual(1000);
  });

  test('handles negative numbers gracefully', () => {
    const result = lookupReference('Genesis -5:1');
    expect(result).toBeDefined();
    expect(result.verse_ids).toBeDefined();
    // Should return empty or valid verses, not crash
    expect(Array.isArray(result.verse_ids)).toBe(true);
  });
});

describe('lookupReference - Input Validation', () => {
  test('returns empty for null input', () => {
    const result = lookupReference(null);
    expect(result.verse_ids).toEqual([]);
    expect(result.error).toBeDefined();
  });

  test('returns empty for undefined input', () => {
    const result = lookupReference(undefined);
    expect(result.verse_ids).toEqual([]);
  });

  test('returns empty for empty string', () => {
    const result = lookupReference('');
    expect(result.verse_ids).toEqual([]);
  });

  test('returns empty for whitespace-only string', () => {
    const result = lookupReference('   ');
    expect(result.verse_ids).toEqual([]);
  });

  test('returns empty for non-string input', () => {
    const result = lookupReference(12345);
    expect(result.verse_ids).toEqual([]);
  });

  test('handles very long input gracefully', () => {
    const longInput = 'Genesis '.repeat(1000);
    const result = lookupReference(longInput);
    // Should not crash, may return empty
    expect(result).toBeDefined();
  });
});

describe('lookupReference - Error Reporting', () => {
  test('reports error for unrecognized book', () => {
    const result = lookupReference('Xyzzy 1:1');
    expect(result.verse_ids).toEqual([]);
    expect(result.error).toContain('not recognized');
  });

  test('returns valid result for known book', () => {
    const result = lookupReference('John 3:16');
    expect(result.verse_ids.length).toBe(1);
    expect(result.error).toBeUndefined();
  });
});

describe('lookupReference - Canon Support', () => {
  test('LDS canon lookup works', () => {
    const result = lookupReference('John 3:16', 'en', { canon: 'lds' });
    expect(result.verse_ids.length).toBe(1);
    expect(result.verse_ids[0]).toBeGreaterThan(0);
  });

  // TODO: un-skip when the cross-canon concordance work lands on master.
  // The 'coc' canon path (extraCanons/applyCanonOverride, C-prefixed verse IDs)
  // exists only in the in-flight cross-canon branch; on master this has never
  // passed. Tracked alongside the uncommitted work in scriptcanon.mjs.
  test.skip('COC canon lookup works', () => {
    // Use a Book of Mormon reference since COC only has BofM versification
    const result = lookupReference('1 Nephi 1:1', 'en', { canon: 'coc' });
    expect(result.verse_ids.length).toBe(1);
    // COC IDs start with 'C'
    expect(String(result.verse_ids[0]).startsWith('C')).toBe(true);
  });
});

describe('generateReference - Canon Support', () => {
  test('generates LDS format reference', () => {
    // Get a verse ID first
    const lookup = lookupReference('John 3:16', 'en');
    const result = generateReference(lookup.verse_ids, 'en');
    expect(result).toContain('John');
    expect(result).toContain('3:16');
  });

  test('generates from options object with canon', () => {
    const lookup = lookupReference('John 3:16', 'en');
    const result = generateReference(lookup.verse_ids, 'en', { canon: 'lds' });
    expect(result).toContain('John');
  });
});
