import { describe, test, expect } from 'vitest';
import yaml from 'js-yaml';
import { simpleData, renderSimple, renderError, renderUsage, CONTENT_TYPES } from '../../../src/api/v1/render.js';
import { ApiError } from '../../../src/api/v1/errors.js';

const data = {
  versions: [{ id: 'NRSV', name: 'NRSV', language: 'en', copyright: null }, { id: 'KJV', name: 'KJV', language: 'en', copyright: null }],
  reference: [{ label: 'John 3:16-17' }],
  passages: [{ headings: {}, verses: [
    { id: 1, book: 'John', chapter: 3, verse: 16, texts: { NRSV: 'For God so loved.', KJV: 'For God so loved,' } },
    { id: 2, book: 'John', chapter: 3, verse: 17, texts: { NRSV: 'Indeed.', KJV: null } },
  ] }],
};
const one = { ...data, versions: [data.versions[0]] };
// A third version with none of the verses
const withEmpty = { ...data, versions: [...data.versions, { id: 'LDS', name: 'LDS', language: 'en', copyright: null }] };

describe('simpleData', () => {
  test('one object per version, verses always carry chapter', () => {
    expect(simpleData(one)).toEqual({
      reference: 'John 3:16-17', version: 'NRSV', text: 'For God so loved. Indeed.',
      verses: [{ chapter: 3, verse: 16, text: 'For God so loved.' }, { chapter: 3, verse: 17, text: 'Indeed.' }],
      copyright: null,
    });
    expect(Array.isArray(simpleData(data))).toBe(true);
    expect(simpleData(data)[1].verses).toHaveLength(1);
  });
});

describe('renderSimple', () => {
  test('json', () => expect(JSON.parse(renderSimple('json', one)).version).toBe('NRSV'));
  test('yaml', () => {
    expect(renderSimple('yaml', one)).toContain('version: NRSV');
    expect(yaml.load(renderSimple('yaml', data))).toEqual(simpleData(data));
  });
  test('yaml keeps long text on one line', () => {
    const long = 'For God so loved the world that he gave his only Son, so that everyone who believes in him may not perish.';
    const body = renderSimple('yaml', { ...one, passages: [{ headings: {}, verses: [{ id: 1, chapter: 3, verse: 16, texts: { NRSV: long } }] }] });
    expect(body).toContain(`text: ${long}\n`);
  });
  test('markdown', () => expect(renderSimple('markdown', one)).toBe('> For God so loved. Indeed.\n>\n> — John 3:16-17 (NRSV)\n'));
  test('markdown, a quote per version', () => expect(renderSimple('markdown', data)).toBe(
    '> For God so loved. Indeed.\n>\n> — John 3:16-17 (NRSV)\n\n> For God so loved,\n>\n> — John 3:16-17 (KJV)\n'
  ));
  test('text, one line per version, each named when there are several', () => {
    expect(renderSimple('text', data)).toBe('NRSV: For God so loved. Indeed.\nKJV: For God so loved,\n');
    expect(renderSimple('text', one)).toBe('For God so loved. Indeed.\n');
  });
  test('markdown and text leave out a version with no verses', () => {
    expect(renderSimple('markdown', withEmpty)).toBe(renderSimple('markdown', data));
    expect(renderSimple('text', withEmpty)).toBe(renderSimple('text', data));
  });
  test('json and yaml keep a version with no verses', () => {
    expect(simpleData(withEmpty)[2]).toMatchObject({ version: 'LDS', text: '', verses: [] });
  });
  test('yaml repeats shared values instead of using anchors', () => {
    const copyright = { holder: 'X' };
    const shared = { ...data, versions: data.versions.map(v => ({ ...v, copyright })) };
    expect(renderSimple('yaml', shared)).not.toMatch(/[&*]ref/);
  });
});

describe('renderError', () => {
  const e = new ApiError('verse_out_of_range', 'Jonah 3 has 10 verses.', 'Jonah 3:10');
  test('json', () => expect(JSON.parse(renderError('json', e))).toEqual({ error: { code: 'verse_out_of_range', message: 'Jonah 3 has 10 verses.', suggestion: 'Jonah 3:10' } }));
  test('api carries the API version', () => expect(JSON.parse(renderError('api', e)).api).toBe('v1'));
  test('yaml', () => expect(yaml.load(renderError('yaml', e))).toEqual({ error: e.toJSON() }));
  test('text', () => expect(renderError('text', e)).toBe('Jonah 3 has 10 verses.\n'));
  test('raw is the json error', () => expect(renderError('raw', e)).toBe(renderError('json', e)));
});

describe('renderSimple raw', () => {
  // A passage built with stored: true carries each version's stored row per verse
  const row = (text, format = 'prose', p = '', s = '') => ({ text, format, p, s });
  const stored = { ...data, passages: [{ headings: {}, verses: [
    { ...data.passages[0].verses[0], stored: { NRSV: row('§¶“For God so loved.', 'prose', '¶', '§'), KJV: row('For God so loved,') } },
    { ...data.passages[0].verses[1], stored: { NRSV: row('Indeed./', 'poetry'), KJV: null } },
  ] }] };
  test('the stored rows, markers kept, by version then verse', () => expect(renderSimple('raw', stored)).toBe(JSON.stringify([
    { id: 1, version: 'NRSV', book: 'John', chapter: 3, verse: 16, format: 'prose', p: '¶', s: '§', text: '§¶“For God so loved.' },
    { id: 2, version: 'NRSV', book: 'John', chapter: 3, verse: 17, format: 'poetry', p: '', s: '', text: 'Indeed./' },
    { id: 1, version: 'KJV', book: 'John', chapter: 3, verse: 16, format: 'prose', p: '', s: '', text: 'For God so loved,' },
  ])));
  test('a version with none of the verses adds no rows', () => {
    const more = { ...stored, versions: withEmpty.versions };
    expect(renderSimple('raw', more)).toBe(renderSimple('raw', stored));
  });
});

describe('raw content type and usage', () => {
  test('content type', () => expect(CONTENT_TYPES.raw).toBe('application/json; charset=utf-8'));
  test('usage', () => {
    expect(JSON.parse(renderUsage('raw', 'raw'))).toEqual({ usage: 'https://raw.scripture.guide/<version>/<reference>', example: 'https://raw.scripture.guide/nrsv/john3.16' });
  });
});
