import { describe, test, expect } from 'vitest';
import { parseApiPath } from '../../../src/api/v1/path.js';
import { ApiError } from '../../../src/api/v1/errors.js';

// The shape ApiRepository.translations() returns: lower-case id → { id, name }
const KNOWN = new Map(['NRSV', 'KJV', 'LDS', 'JST', '1830', 'printer'].map(id => [id.toLowerCase(), { id, name: id }]));
const parse = path => parseApiPath(path, KNOWN);
const errorOf = path => { try { parse(path); } catch (e) { return e; } return null; };

describe('parseApiPath: passages', () => {
  test('version, translation and reference', () => {
    expect(parse('/v1/nrsv/john3.16')).toEqual({ api: 1, options: [], kind: 'passage', translations: ['NRSV'], reference: 'john3.16' });
  });
  test('a missing version means the current one', () => {
    expect(parse('/nrsv/john3.16')).toMatchObject({ api: 1, translations: ['NRSV'] });
  });
  test('no translation', () => {
    expect(parse('/v1/john3.16')).toMatchObject({ translations: [], reference: 'john3.16' });
  });
  test('options come before the translation', () => {
    expect(parse('/v1/html/ids/kjv/john3.16')).toMatchObject({ options: ['html', 'ids'], translations: ['KJV'] });
  });
  test('ids come back in their stored case', () => {
    expect(parse('/v1/PRINTER.Nrsv/1ne1.1').translations).toEqual(['printer', 'NRSV']);
    expect(parse('/v1/search/Printer/love').translation).toBe('printer');
  });
  test('several translations; the *format suffix is ignored', () => {
    expect(parse('/v1/nrsv.kjv*lds/john3.16').translations).toEqual(['NRSV', 'KJV']);
  });
  test('extra segments are more reference pieces', () => {
    expect(parse('/v1/kjv/john.3.16/gen.1.1').reference).toBe('john.3.16; gen.1.1');
  });
  test('percent-encoded references are decoded', () => {
    expect(parse('/v1/kjv/john%203:16').reference).toBe('john 3:16');
  });
});

describe('parseApiPath: errors', () => {
  test('an unknown translation followed by a reference', () => {
    const e = errorOf('/v1/foo/john3.16');
    expect(e).toBeInstanceOf(ApiError);
    expect(e.code).toBe('unknown_translation');
  });
  test('an unsupported api version', () => {
    expect(errorOf('/v2/john3.16').code).toBe('unsupported_api_version');
  });
  test('nothing to look up', () => {
    expect(errorOf('/v1').code).toBe('unparseable_reference');
  });
});

describe('parseApiPath: parallel', () => {
  test('two sides with translations', () => {
    expect(parse('/v1/kjv/isa2~lds/2ne12')).toMatchObject({ kind: 'parallel', query: 'kjv/isa2~lds/2ne12' });
  });
});

describe('parseApiPath: search', () => {
  test('terms only; + and . read as spaces', () => {
    expect(parse('/v1/search/loved+the.world')).toEqual({ api: 1, options: [], kind: 'search', terms: 'loved the world', translation: null, volume: null, page: 1 });
  });
  test('scope segments', () => {
    expect(parse('/v1/search/nrsv/nt/page-2/loved%20the%20world')).toMatchObject({ terms: 'loved the world', translation: 'NRSV', volume: 'nt', page: 2 });
  });
  test('an unknown scope word is an unknown translation', () => {
    expect(errorOf('/v1/search/foo/love').code).toBe('unknown_translation');
  });
  test('no terms', () => {
    expect(errorOf('/v1/search').code).toBe('empty_query');
  });
});

describe('parseApiPath: random', () => {
  test('bare', () => expect(parse('/v1/random')).toMatchObject({ kind: 'random', translations: [], volume: null }));
  test('with a translation', () => expect(parse('/v1/nrsv.kjv/random')).toMatchObject({ kind: 'random', translations: ['NRSV', 'KJV'] }));
  test('with a volume', () => expect(parse('/v1/random/bom')).toMatchObject({ kind: 'random', volume: 'bom' }));
});
