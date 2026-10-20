import { describe, test, expect } from 'vitest';
import { legacyRequest, hasFlag } from '../../src/presentation/legacy/request.js';

// Minimal stand-in for an Express request.
const req = (path, query = {}, host = 'api.scripture.guide', extra = {}) => ({ path, query, hostname: host, ...extra });

describe('legacyRequest (lib.php.inc URL rules)', () => {
  test('reference only: no versions, config null', () => {
    const r = legacyRequest(req('/john.3.16'));
    expect(r).toMatchObject({ q: 'john.3.16', ref: 'john.3.16', versions: null, specified: false, config: null });
  });

  test('version path sets config.versions', () => {
    const r = legacyRequest(req('/kjv/john.3.16'));
    expect(r.ref).toBe('john.3.16');
    expect(r.versions).toEqual({ KJV: 'KJV' });
    expect(r.config).toEqual({ versions: { KJV: 'KJV' } });
  });

  test('several versions and format overrides', () => {
    const r = legacyRequest(req('/kjv.asv*web/gen.1.1'));
    expect(r.versions).toEqual({ KJV: 'KJV', ASV: 'WEB' });
  });

  test('extra path segments become compound references', () => {
    expect(legacyRequest(req('/kjv/john.3.16/gen.1.1')).ref).toBe('john.3.16; gen.1.1');
  });

  test('query flags: empty value becomes 1, order kept, versions last', () => {
    const r = legacyRequest(req('/kjv/john.3.16', { meta_only: '', heads: '', x: 'y' }));
    expect(r.config).toEqual({ meta_only: 1, heads: 1, x: 'y', versions: { KJV: 'KJV' } });
    expect(Object.keys(r.config)).toEqual(['meta_only', 'heads', 'x', 'versions']);
  });

  test('d&c in the path is rejoined as PHP flattenRequest did', () => {
    const r = legacyRequest(req('/d&c.4'));
    expect(r.ref).toBe('dc.4');
    expect(r.config).toBeNull();
  });

  test('other ampersand fragments become flags', () => {
    const r = legacyRequest(req('/john.3.16&meta_only'));
    expect(r.ref).toBe('john.3.16');
    expect(r.config).toEqual({ meta_only: 1 });
  });

  test('strips a format path prefix', () => {
    expect(legacyRequest(req('/api/kjv/john.3.16')).versions).toEqual({ KJV: 'KJV' });
  });

  test('shaves a trailing subverse letter with its digit (PHP quirk)', () => {
    expect(legacyRequest(req('/john.3.16a')).ref).toBe('john.3.1');
  });

  test('adds jst to the reference when JST is the version', () => {
    expect(legacyRequest(req('/jst/gen.1.1')).ref).toBe('jst gen.1.1');
  });

  test('decodes the path', () => {
    expect(legacyRequest(req('/John%203:16')).ref).toBe('John 3:16');
  });
});

describe('hasFlag', () => {
  test('reads query flags, host labels and req.config.options', () => {
    expect(hasFlag(req('/john.3.16', { meta_only: '' }), 'meta_only')).toBe(true);
    expect(hasFlag(req('/john.3.16', {}, 'api.heads.scripture.guide'), 'heads')).toBe(true);
    expect(hasFlag(req('/john.3.16', {}, 'api.scripture.guide', { config: { options: { output_only: 1 } } }), 'output_only')).toBe(true);
    expect(hasFlag(req('/john.3.16'), 'meta_only')).toBe(false);
  });
});
