import { describe, test, expect } from 'vitest';
import { parseLine, shapeOf, sample } from './traffic.mjs';

const line = '[20/Oct/2026:22:41:07 +0000] BYPASS 200 200 - GET http api.scripture.guide "/kjv/john.3.16" [Client 203.0.113.9] [Length 2711] [Gzip -] [Sent-to php] "Mozilla/5.0" "-"';

describe('traffic corpus', () => {
  test('parses method, status, host and path', () => {
    expect(parseLine(line)).toEqual({ method: 'GET', status: 200, host: 'api.scripture.guide', path: '/kjv/john.3.16' });
  });
  test('ignores static files and non-GET', () => {
    expect(parseLine(line.replace('/kjv/john.3.16', '/js/main.js'))).toBeNull();
    expect(parseLine(line.replace(' GET ', ' POST '))).toBeNull();
  });
  test('shape abstracts references so similar requests group together', () => {
    expect(shapeOf('/kjv/john.3.16')).toBe(shapeOf('/niv/gen.1.1'));
    expect(shapeOf('/john.3.16-18')).not.toBe(shapeOf('/john.3.16'));
  });
  test('sample keeps at most n per (format, shape), deterministically', () => {
    const reqs = Array.from({ length: 50 }, (_, i) => ({ format: 'html', path: `/gen.1.${i + 1}` }));
    expect(sample(reqs, 3)).toHaveLength(3);
    expect(sample(reqs, 3)).toEqual(sample(reqs, 3));
  });
  test('sample with maxGroups keeps the most-requested groups', () => {
    const reqs = [
      ...Array.from({ length: 5 }, () => ({ format: 'html', path: '/john.3.16' })),
      { format: 'meta', path: '/ps.23' },
    ];
    expect(sample(reqs, 1, 1)).toEqual([{ format: 'html', path: '/john.3.16' }]);
  });
});
