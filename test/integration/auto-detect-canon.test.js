// test/integration/auto-detect-canon.test.js
import { lookupReference } from '../../src/scriptures.mjs';

describe('Auto-detect Canon Fallback', () => {
  test('detects COC when verse number exceeds LDS', () => {
    // LDS 1 Nephi 3 has 31 verses, COC has 255
    const result = lookupReference('1 Nephi 3:150');
    expect(result.canon).toBe('coc');
    expect(result.verse_ids.length).toBeGreaterThan(0);
  });

  test('does not include canon field when matches default', () => {
    const result = lookupReference('John 3:16');
    expect(result.canon).toBeUndefined();
  });

  test('explicit canon overrides auto-detect', () => {
    const result = lookupReference('1 Nephi 1:1', 'en', { canon: 'coc' });
    expect(result.canon).toBeUndefined(); // matches explicit, no field
  });

  test('returns empty when verse does not exist in any canon', () => {
    // Very high verse number that doesn't exist anywhere
    // Use noMulti to avoid slow language fallback during test
    const result = lookupReference('1 Nephi 1:999', 'en', { noMulti: true });
    expect(result.verse_ids.length).toBe(0);
    expect(result.canon).toBeUndefined();
  });

  test('auto-detect works for mid-range COC verses', () => {
    // COC 1 Nephi 3 goes up to 255, trying verse 100
    const result = lookupReference('1 Nephi 3:100');
    expect(result.canon).toBe('coc');
    expect(result.verse_ids.length).toBe(1);
  });
});
