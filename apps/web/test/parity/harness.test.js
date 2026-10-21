import { describe, test, expect } from 'vitest';
import { diffName } from './harness.mjs';

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
