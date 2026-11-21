import { describe, test, expect } from 'vitest';
import { parseApiPath } from '../../../src/api/v1/path.js';
import { ApiError } from '../../../src/api/v1/errors.js';

// The shape ApiRepository.versions() returns: lower-case id → { id, name, lang }
const KNOWN = new Map(['NRSV', 'KJV', 'LDS', 'JST', '1830', 'printer'].map(id => [id.toLowerCase(), { id, name: id, lang: 'en' }]));
const parse = path => parseApiPath(path, KNOWN);
const errorOf = path => { try { parse(path); } catch (e) { return e; } return null; };

describe('parseApiPath: passages', () => {
  test('api version, version and reference', () => {
    expect(parse('/v1/nrsv/john3.16')).toEqual({ api: 1, options: [], kind: 'passage', versions: ['NRSV'], reference: 'john3.16' });
  });
  test('a missing version means the current one', () => {
    expect(parse('/nrsv/john3.16')).toMatchObject({ api: 1, versions: ['NRSV'] });
  });
  test('no version', () => {
    expect(parse('/v1/john3.16')).toMatchObject({ versions: [], reference: 'john3.16' });
  });
  test('options come before the version', () => {
    expect(parse('/v1/html/ids/kjv/john3.16')).toMatchObject({ options: ['html', 'ids'], versions: ['KJV'] });
  });
  test('ids come back in their stored case', () => {
    expect(parse('/v1/PRINTER.Nrsv/1ne1.1').versions).toEqual(['printer', 'NRSV']);
    expect(parse('/v1/search/Printer/love').version).toBe('printer');
  });
  test('several versions; the *format suffix is ignored', () => {
    expect(parse('/v1/nrsv.kjv*lds/john3.16').versions).toEqual(['NRSV', 'KJV']);
  });
  test('extra segments are more reference pieces', () => {
    expect(parse('/v1/kjv/john.3.16/gen.1.1').reference).toBe('john.3.16; gen.1.1');
  });
  test('percent-encoded references are decoded', () => {
    expect(parse('/v1/kjv/john%203:16').reference).toBe('john 3:16');
  });
});

describe('parseApiPath: errors', () => {
  test('an unknown version followed by a reference', () => {
    const e = errorOf('/v1/foo/john3.16');
    expect(e).toBeInstanceOf(ApiError);
    expect(e.code).toBe('unknown_version');
  });
  test('a version segment that names no version', () => {
    for (const path of ['/v1/../john3', '/v1/.*lds/john3', '/v1/./random']) {
      expect(errorOf(path)?.code).toBe('unknown_version');
    }
  });
  test('an unsupported api version', () => {
    expect(errorOf('/v2/john3.16').code).toBe('unsupported_api_version');
  });
  test('a version with a leading zero is not a version', () => {
    expect(errorOf('/v01/john3.16')).toMatchObject({ code: 'unknown_version', message: 'There is no version "v01".' });
    expect(parse('/v01')).toMatchObject({ api: 1, kind: 'passage', versions: [], reference: 'v01' });
  });
  test('a version named twice is listed once, in first-seen order', () => {
    expect(parse('/v1/nrsv.kjv.NRSV/john3.16').versions).toEqual(['NRSV', 'KJV']);
  });
  test('more than ten versions is too large', () => {
    const many = new Map(Array.from({ length: 11 }, (_, i) => [`v${i}x`, { id: `V${i}X`, name: 'x', lang: 'en' }]));
    const ids = [...many.keys()];
    expect(parseApiPath(`/v1/${ids.slice(0, 10).join('.')}/john3.16`, many).versions).toHaveLength(10);
    expect(() => parseApiPath(`/v1/${ids.join('.')}/john3.16`, many)).toThrow(expect.objectContaining({ code: 'reference_too_large', status: 400 }));
  });
  test('nothing to look up', () => {
    expect(errorOf('/v1').code).toBe('unparseable_reference');
  });
  test('a version with no reference after it', () => {
    for (const path of ['/v1/nrsv/', '/nrsv', '/v1/html/NRSV.kjv/']) {
      expect(errorOf(path)).toMatchObject({ code: 'unparseable_reference', status: 400 });
    }
    expect(errorOf('/v1/nrsv/').message).toBe('No reference was given after the version.');
    // Not every piece is a version: read as a reference
    expect(parse('/v1/nrsv.john3')).toMatchObject({ kind: 'passage', reference: 'nrsv.john3' });
    // A number alone is a verse id, even where it is also a version id (1830)
    expect(parse('/v1/1830')).toMatchObject({ kind: 'passage', versions: [], reference: '1830' });
  });
});

describe('parseApiPath: parallel', () => {
  test('two sides with versions', () => {
    expect(parse('/v1/kjv/isa2~lds/2ne12')).toMatchObject({ kind: 'parallel', query: 'kjv/isa2~lds/2ne12' });
  });
});

describe('parseApiPath: search', () => {
  test('terms only; + and . read as spaces', () => {
    expect(parse('/v1/search/loved+the.world')).toEqual({ api: 1, options: [], kind: 'search', terms: 'loved the world', version: null, volume: null, page: 1 });
  });
  test('scope segments', () => {
    expect(parse('/v1/search/nrsv/nt/page-2/loved%20the%20world')).toMatchObject({ terms: 'loved the world', version: 'NRSV', volume: 'nt', page: 2 });
  });
  test('an unknown scope word is an unknown version', () => {
    expect(errorOf('/v1/search/foo/love')).toMatchObject({
      code: 'unknown_version',
      message: 'Unknown search scope "foo". Use a version, a volume or page-<n>; the search terms go last.',
    });
  });
  test('no terms', () => {
    expect(errorOf('/v1/search').code).toBe('empty_query');
  });
});

describe('parseApiPath: versions', () => {
  test('the version list', () => {
    expect(parse('/v1/versions')).toEqual({ api: 1, options: [], kind: 'versions' });
    expect(parse('/versions')).toMatchObject({ kind: 'versions' });
  });
});

describe('parseApiPath: random', () => {
  test('bare', () => expect(parse('/v1/random')).toMatchObject({ kind: 'random', versions: [], volume: null }));
  test('with a version', () => expect(parse('/v1/nrsv.kjv/random')).toMatchObject({ kind: 'random', versions: ['NRSV', 'KJV'] }));
  test('with a volume', () => expect(parse('/v1/random/bom')).toMatchObject({ kind: 'random', volume: 'bom' }));
  test('an unknown volume is an error', () => {
    for (const path of ['/v1/random/xx', '/v1/kjv/random/foo']) {
      const e = errorOf(path);
      expect(e).toBeInstanceOf(ApiError);
      expect(e).toMatchObject({ code: 'unknown_volume', status: 404 });
    }
  });
});
