import { describe, test, expect } from 'vitest';
import { diffName, hostFor, legacyRawPath } from './harness.mjs';

describe('diffName', () => {
  test('paths that flatten to the same text get different names', () => {
    const names = ['/', '/~/', '/?feed=rss2'].map(p => diffName('html', p));
    expect(new Set(names).size).toBe(3);
  });
  test('the same request always gets the same name', () => {
    expect(diffName('api', '/john.3.16')).toBe(diffName('api', '/john.3.16'));
  });
  test('names stay readable and short enough for the filesystem', () => {
    expect(diffName('api', '/john.3.16')).toMatch(/^api__john_3_16_[0-9a-f]{8}$/);
    expect(diffName('html', '/' + 'x'.repeat(500)).length).toBeLessThanOrEqual(120);
  });
});

describe('the legacy raw format', () => {
  // raw. is the v1 database dump now (an array of rows); the old keyed-by-verse-id shape, with
  // headings, is the main host's /raw/ prefix, live and Node alike
  test('is read from the main host /raw/ prefix', () => {
    expect(hostFor('raw')).toBe('scripture.guide');
    expect(legacyRawPath('NRSV', 14237)).toBe('/raw/nrsv/14237');
    expect(legacyRawPath('printer', '1;2')).toBe('/raw/printer/1;2');
  });
});
