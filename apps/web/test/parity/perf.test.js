import { describe, test, expect } from 'vitest';
import { percentile, summarize, ratio, isFlagged, cachedLive, report } from './perfStats.mjs';

describe('percentile', () => {
  test('interpolates between the closest ranks', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([4, 1, 3, 2], 50)).toBe(2.5);
    expect(percentile([10, 20, 30, 40, 50], 95)).toBe(48);
  });
  test('one value is every percentile', () => {
    expect(percentile([7], 50)).toBe(7);
    expect(percentile([7], 95)).toBe(7);
  });
  test('no values have no percentile', () => {
    expect(percentile([], 50)).toBeNull();
  });
});

describe('summarize', () => {
  test('count, p50 and p95', () => {
    expect(summarize([1, 2, 3])).toEqual({ n: 3, p50: 2, p95: 2.9 });
  });
  test('empty', () => {
    expect(summarize([])).toEqual({ n: 0, p50: null, p95: null });
  });
});

describe('ratio', () => {
  test('node over live', () => {
    expect(ratio(300, 200)).toBe(1.5);
  });
  test('null without a live time', () => {
    expect(ratio(300, null)).toBeNull();
    expect(ratio(300, 0)).toBeNull();
    expect(ratio(null, 200)).toBeNull();
  });
});

describe('isFlagged', () => {
  test('more than 1.5x and more than 300 ms slower', () => {
    expect(isFlagged(700, 300)).toBe(true);
  });
  test('slower by more than 1.5x but by less than 300 ms', () => {
    expect(isFlagged(400, 100)).toBe(false);
  });
  test('more than 300 ms slower but within 1.5x', () => {
    expect(isFlagged(1400, 1000)).toBe(false);
  });
  test('exactly at the bounds is not flagged', () => {
    expect(isFlagged(900, 600)).toBe(false); // 1.5x, 300 ms
  });
  test('no live time, no flag', () => {
    expect(isFlagged(5000, null)).toBe(false);
  });
});

describe('cachedLive', () => {
  const cache = { 'https://scripture.guide/john.3.16': { at: '2026-10-20T00:00:00Z', times: [100, 110, 120] } };
  test('reuses an entry with at least as many runs', () => {
    expect(cachedLive(cache, 'https://scripture.guide/john.3.16', 3)).toEqual([100, 110, 120]);
    expect(cachedLive(cache, 'https://scripture.guide/john.3.16', 2)).toEqual([100, 110]);
  });
  test('an entry with fewer runs is refetched', () => {
    expect(cachedLive(cache, 'https://scripture.guide/john.3.16', 5)).toBeNull();
  });
  test('refresh ignores the cache', () => {
    expect(cachedLive(cache, 'https://scripture.guide/john.3.16', 3, { refresh: true })).toBeNull();
  });
  test('missing entry', () => {
    expect(cachedLive(cache, 'https://scripture.guide/gen.1', 3)).toBeNull();
  });
});

describe('report', () => {
  const results = [
    { format: 'html', path: '/a', node: [100, 120, 110], live: [100, 100, 100] },
    { format: 'html', path: '/b', node: [900, 1000, 950], live: [300, 310, 290] },
    { format: 'api', path: '/a', node: [50, 50, 50], live: null },
  ];
  const r = report(results);
  test('per URL medians, ratio and flag', () => {
    expect(r.urls.map(u => [u.format, u.path, u.node, u.live, u.ratio, u.flagged])).toEqual([
      ['html', '/a', 110, 100, 1.1, false],
      ['html', '/b', 950, 300, 950 / 300, true],
      ['api', '/a', 50, null, null, false],
    ]);
  });
  test('per format: percentiles of URL medians; ratio over URLs timed on both sides', () => {
    expect(r.formats.html.node).toEqual({ n: 2, p50: 530, p95: 908 });
    expect(r.formats.html.live).toEqual({ n: 2, p50: 200, p95: 290 });
    expect(r.formats.html.ratio).toBeCloseTo(530 / 200);
    expect(r.formats.html.flagged).toBe(1);
    expect(r.formats.api.live).toEqual({ n: 0, p50: null, p95: null });
    expect(r.formats.api.ratio).toBeNull();
  });
  test('overall', () => {
    expect(r.overall.node.n).toBe(3);
    expect(r.overall.live.n).toBe(2);
    // the ratio pairs node and live on the same URLs (api /a has no live time)
    expect(r.overall.ratio).toBeCloseTo(530 / 200);
  });
});
