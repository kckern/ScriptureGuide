import { describe, test, expect } from 'vitest';
import { parseHost, parseRequest, randomVerseId } from '../../src/domain/rules/requestParsing.js';

const req = (path, query = {}, host = 'scripture.guide') => parseRequest({ host, path, query, random: () => 0 });

describe('parseHost', () => {
  test('first label is the subdomain', () => {
    expect(parseHost('api.scripture.guide')).toEqual({ subdomain: 'api', flags: {} });
    expect(parseHost('scripture.guide').subdomain).toBe('scripture');
  });
  test('labels between the first and the last two become flags', () => {
    expect(parseHost('api.plain.scripture.guide')).toEqual({ subdomain: 'api', flags: { plain: 1 } });
    expect(parseHost('meta.a.b.scripture.guide:443').flags).toEqual({ a: 1, b: 1 });
  });
});

describe('format', () => {
  test('subdomain selects the format', () => {
    expect(req('/john.3.16', {}, 'api.scripture.guide').outputFormat).toBe('api');
    expect(req('/john.3.16', {}, 'json.scripture.guide').outputFormat).toBe('api');
    expect(req('/john.3.16', {}, 'latex.scripture.guide').outputFormat).toBe('latex');
    expect(req('/john.3.16').outputFormat).toBe('html');
    expect(req('/john.3.16', {}, 'www.scripture.guide').outputFormat).toBe('html');
  });
  test('api/ img/ mp3/ path shortcuts set the subdomain and are stripped', () => {
    const r = req('/api/john.3.16');
    expect(r.subdomain).toBe('api');
    expect(r.outputFormat).toBe('api');
    expect(r.reference).toBe('john.3.16');
    expect(req('/IMG/kjv/gen.1.1').subdomain).toBe('img');
    expect(req('/mp3/john.3.16').outputFormat).toBe('audio');
  });
  test('other format path prefixes of the Node routes are stripped too', () => {
    const r = req('/latex/john.3.16');
    expect(r.outputFormat).toBe('latex');
    expect(r.reference).toBe('john.3.16');
  });
});

describe('options', () => {
  test('every query key except q becomes an option; empty value is 1', () => {
    const r = req('/john.3.16', { plain: '', headings: '0', version: 'KJV', q: 'x' });
    expect(r.options).toEqual({ plain: 1, headings: '0', version: 'KJV' });
  });
  test('?version= selects the version when the path has none', () => {
    expect(req('/john.3.16', { version: 'kjv' }).versions).toEqual([{ version: 'KJV', format: 'KJV' }]);
    expect(req('/esv/john.3.16', { version: 'kjv' }).versions).toEqual([{ version: 'ESV', format: 'ESV' }]);
  });
});

describe('q normalization', () => {
  test('one segment is a reference', () => {
    const r = req('/john.3.16');
    expect(r.reference).toBe('john.3.16');
    expect(r.versions).toEqual([]);
    expect(r.versionSpec).toBeNull();
    expect(r.search).toBe(false);
  });
  test('D&C keeps its ampersand from the path', () => {
    expect(req('/d&c.4').reference).toBe('d&c.4');
  });
  test('D&C split by a query string is rejoined', () => {
    const r = req('/d', { 'c.4': '', plain: '' });
    expect(r.reference).toBe('d&c.4');
    expect(r.options).toEqual({ plain: 1 });
  });
  test('=/ prefix sets cropped', () => {
    const r = req('/=/1830/1ne.1.1');
    expect(r.cropped).toBe(true);
    expect(r.reference).toBe('1ne.1.1');
  });
  test('.jpg and .png are stripped', () => {
    expect(req('/1830/1ne.1.1.jpg').reference).toBe('1ne.1.1');
  });
  test('search/<terms>', () => {
    const r = req('/search/faith.hope.charity');
    expect(r.search).toBe(true);
    expect(r.reference).toBe('faith.hope.charity');
  });
  test('no digits means search', () => {
    expect(req('/faith').search).toBe(true);
    expect(req('/kjv/faith').search).toBe(true);
  });
  test('version spec: dots, separators and formats', () => {
    const r = req('/kjv.1830*rebom/1ne.1.1');
    expect(r.versions).toEqual([
      { version: 'KJV', format: 'KJV' },
      { version: '1830', format: 'REBOM' },
    ]);
    expect(r.versionSpec).toBe('kjv.1830*rebom');
    expect(r.reference).toBe('1ne.1.1');
    expect(req('/kjv, asv;;niv/john.3.16').versions.map(v => v.version)).toEqual(['KJV', 'ASV', 'NIV']);
    expect(req('/kjv..asv/john.3.16').versions.map(v => v.version)).toEqual(['KJV', 'ASV']);
  });
  test('extra segments are joined with "; "', () => {
    expect(req('/kjv/john.3.16/gen.1.1').reference).toBe('john.3.16; gen.1.1');
  });
  test('trailing subverse letter is removed', () => {
    expect(req('/john.3.16a').reference).toBe('john.3.16');
  });
  test('JST in the versions prefixes the reference', () => {
    expect(req('/jst/john.3.16').reference).toBe('jst john.3.16');
    expect(req('/jst/jst.john.3.16').reference).toBe('jst.john.3.16');
    expect(req('/jst/faith').reference).toBe('faith');
  });
  test('random picks a verse id from a volume range', () => {
    const r = req('/random');
    expect(r.reference).toMatch(/^\d+$/);
    expect(randomVerseId(() => 0)).toBe(1);
    expect(randomVerseId(() => 0.9999)).toBe(42599);
  });
  test('~ marks a parallel request and keeps the whole q', () => {
    const r = req('/kjv/isa.2.1~2ne.12.1');
    expect(r.parallel).toBe(true);
    expect(r.reference).toBe('kjv/isa.2.1~2ne.12.1');
  });
  test('empty path is home', () => {
    const r = req('/');
    expect(r.reference).toBe('');
    expect(r.search).toBe(false);
  });
  test('percent-encoded paths are decoded', () => {
    expect(req('/john%203:16').reference).toBe('john 3:16');
  });
});
