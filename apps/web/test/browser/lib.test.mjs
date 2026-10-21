import { describe, test, expect } from 'vitest';
import { diffRegions, reuseProblem, obsoleteShared, TEXT_FAMILIES, firstFamily } from './lib.mjs';

// A pixelmatch diff image: differing pixels red, the rest grey (or anti-aliasing yellow).
function image(width, height, red) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([200, 200, 200, 255], i * 4);
  for (const [x, y, color = [255, 0, 0]] of red) data.set([...color, 255], (y * width + x) * 4);
  return data;
}
const block = (x0, y0, w, h) => Array.from({ length: w * h }, (_, i) => [x0 + (i % w), y0 + Math.floor(i / w)]);

describe('diffRegions', () => {
  test('no differing pixels, no regions', () => {
    expect(diffRegions(image(10, 10, []), 10, 10)).toEqual([]);
  });

  test('a block is one region with its bounding box and pixel count', () => {
    expect(diffRegions(image(50, 50, block(10, 20, 5, 4)), 50, 50)).toEqual([{ x: 10, y: 20, w: 5, h: 4, pixels: 20 }]);
  });

  test('pixels within the gap join one region; farther apart they stay apart', () => {
    const near = [...block(0, 0, 2, 2), ...block(3, 0, 2, 2)]; // x 1 and x 3: distance 2
    expect(diffRegions(image(20, 20, near), 20, 20, { gap: 2 })).toHaveLength(1);
    expect(diffRegions(image(20, 20, near), 20, 20, { gap: 1 })).toHaveLength(2);
  });

  test('anti-aliased (yellow) pixels do not count', () => {
    expect(diffRegions(image(10, 10, [[1, 1, [255, 255, 0]]]), 10, 10)).toEqual([]);
  });

  test('largest region first', () => {
    const r = diffRegions(image(100, 100, [...block(0, 0, 2, 2), ...block(50, 50, 10, 10)]), 100, 100);
    expect(r.map(x => x.pixels)).toEqual([100, 4]);
  });
});

describe('reuseProblem', () => {
  const now = Date.parse('2026-10-21T00:00:00Z');
  const expected = { fontMode: 'normalize', normalize: 'v2', mask: ['#searchbox'], viewport: { width: 1280, height: 900 }, liveBase: 'https://scripture.guide', path: '/' };
  const sidecar = { ...expected, capturedAt: '2026-10-20T00:00:00Z' };
  const week = 7 * 86400e3;

  test('a matching, recent capture can be reused', () => {
    expect(reuseProblem(sidecar, expected, now, week)).toBeNull();
  });
  test('no sidecar', () => {
    expect(reuseProblem(null, expected, now, week)).toMatch(/no sidecar/);
  });
  test('older than the max age', () => {
    expect(reuseProblem({ ...sidecar, capturedAt: '2026-10-01T00:00:00Z' }, expected, now, week)).toMatch(/20\.0 days old/);
  });
  test('any setting that differs', () => {
    expect(reuseProblem({ ...sidecar, fontMode: 'native' }, expected, now, week)).toMatch(/fontMode/);
    expect(reuseProblem({ ...sidecar, normalize: 'v1' }, expected, now, week)).toMatch(/normalize/);
    expect(reuseProblem({ ...sidecar, mask: [] }, expected, now, week)).toMatch(/mask/);
    expect(reuseProblem({ ...sidecar, viewport: { width: 800, height: 900 } }, expected, now, week)).toMatch(/viewport/);
    expect(reuseProblem({ ...sidecar, liveBase: 'https://x' }, expected, now, week)).toMatch(/liveBase/);
  });
  test('an unreadable capture time', () => {
    expect(reuseProblem({ ...sidecar, capturedAt: 'soon' }, expected, now, week)).toMatch(/capturedAt/);
  });
});

describe('obsoleteShared', () => {
  const a = { re: /a\.jpg/, why: 'a' };
  const b = { re: /b\.woff/, why: 'b' };
  const echo = { re: /^console: x$/, why: 'echo', echo: true };
  test('an entry Node hit that no live load showed is obsolete', () => {
    expect(obsoleteShared([a, b, echo], new Set([a, b, echo]), new Set([b]))).toEqual([a]);
  });
  test('entries Node did not hit are not judged; echo entries never are', () => {
    expect(obsoleteShared([a, b, echo], new Set([echo]), new Set())).toEqual([]);
  });
});

describe('firstFamily', () => {
  test('the first family of a computed font-family, unquoted', () => {
    expect(firstFamily('"Goudy Scripture", "Sorts Mill Goudy", Georgia, serif')).toBe('Goudy Scripture');
    expect(firstFamily("'KoPub Batang', serif")).toBe('KoPub Batang');
    expect(TEXT_FAMILIES).toContain(firstFamily('"Sorts Mill Goudy", Goudy, Georgia, serif'));
  });
});
