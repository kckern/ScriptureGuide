import { describe, test, expect } from 'vitest';
import yaml from 'js-yaml';
import { simpleData, renderSimple, renderError } from '../../../src/api/v1/render.js';
import { ApiError } from '../../../src/api/v1/errors.js';

const data = {
  versions: [{ id: 'NRSV', name: 'NRSV', language: 'en', copyright: null }, { id: 'KJV', name: 'KJV', language: 'en', copyright: null }],
  reference: [{ label: 'John 3:16-17' }],
  passages: [{ headings: {}, verses: [
    { id: 1, chapter: 3, verse: 16, texts: { NRSV: 'For God so loved.', KJV: 'For God so loved,' } },
    { id: 2, chapter: 3, verse: 17, texts: { NRSV: 'Indeed.', KJV: null } },
  ] }],
};
const one = { ...data, versions: [data.versions[0]] };

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
  test('text, one line per version', () => expect(renderSimple('text', data)).toBe('For God so loved. Indeed.\nFor God so loved,\n'));
});

describe('renderError', () => {
  const e = new ApiError('verse_out_of_range', 'Jonah 3 has 10 verses.', 'Jonah 3:10');
  test('json', () => expect(JSON.parse(renderError('json', e))).toEqual({ error: { code: 'verse_out_of_range', message: 'Jonah 3 has 10 verses.', suggestion: 'Jonah 3:10' } }));
  test('api carries the API version', () => expect(JSON.parse(renderError('api', e)).api).toBe('v1'));
  test('yaml', () => expect(yaml.load(renderError('yaml', e))).toEqual({ error: e.toJSON() }));
  test('text', () => expect(renderError('text', e)).toBe('Jonah 3 has 10 verses.\n'));
});
