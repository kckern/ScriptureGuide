import { describe, test, expect } from 'vitest';
import yaml from 'js-yaml';
import { simpleData, renderSimple, renderError, renderUsage, CONTENT_TYPES } from '../../../src/api/v1/render.js';
import { ApiError } from '../../../src/api/v1/errors.js';

const para = (...pieces) => ({ type: 'paragraph', style: null, pieces });
const piece = (id, verse, start, runs) => ({ id, verse, start, runs });
const data = {
  versions: [{ id: 'NRSV', name: 'NRSV', language: 'en', copyright: null }, { id: 'KJV', name: 'KJV', language: 'en', copyright: null }],
  reference: [{ label: 'John 3:16-17' }],
  passages: [{ headings: {},
    blocks: {
      NRSV: [para(piece(1, 16, true, [{ text: 'For God so loved.' }]), piece(2, 17, true, [{ text: ' Indeed.' }]))],
      KJV: [para(piece(1, 16, true, [{ text: 'For God so loved,' }]))],
    },
    verses: [
      { id: 1, book: 'John', chapter: 3, verse: 16, texts: { NRSV: 'For God so loved.', KJV: 'For God so loved,' } },
      { id: 2, book: 'John', chapter: 3, verse: 17, texts: { NRSV: 'Indeed.', KJV: null } },
    ] }],
};
// Psalm 103:1-2 in blocks: a subtitle, poetry with an indented line, marks, then prose with a
// line break
const psalm = {
  versions: [{ id: 'NRSV', name: 'NRSV', language: 'en', copyright: null }],
  reference: [{ label: 'Psalm 103:1-3' }],
  passages: [{ headings: {},
    blocks: { NRSV: [
      { type: 'subtitle', pieces: [piece(1, 1, true, [{ text: 'Of David.' }])] },
      { type: 'poetry', style: null, lines: [
        { indent: 0, pieces: [piece(1, 1, false, [{ text: 'Bless the ' }, { text: 'Lord', mark: 'smallcaps' }, { text: ', O my soul,' }])] },
        { indent: 1, pieces: [piece(1, 1, false, [{ text: 'and all that is ' }, { text: 'within ', mark: 'em' }, { text: 'me', mark: 'strong' }])] },
      ] },
      { type: 'poetry', style: null, lines: [{ indent: 0, pieces: [piece(2, 2, true, [{ text: 'Bless ' }, { text: 'him', mark: 'sup' }, { text: ' ' }, { text: 'not', mark: 'strike' }])] }] },
      para(piece(3, 3, true, [{ text: 'Who forgives,' }])),
      { type: 'paragraph', style: 'linebreak', indent: 1, pieces: [piece(3, 3, false, [{ text: 'who heals.' }])] },
    ] },
    verses: [
      { id: 1, book: 'Psalms', chapter: 103, verse: 1, texts: { NRSV: 'Of David. Bless the Lord, O my soul, and all that is within me' } },
      { id: 2, book: 'Psalms', chapter: 103, verse: 2, texts: { NRSV: 'Bless him' } },
      { id: 3, book: 'Psalms', chapter: 103, verse: 3, texts: { NRSV: 'Who forgives, who heals.' } },
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
    const body = renderSimple('yaml', { ...one, passages: [{ headings: {}, blocks: { NRSV: [para(piece(1, 16, true, [{ text: long }]))] }, verses: [{ id: 1, chapter: 3, verse: 16, texts: { NRSV: long } }] }] });
    expect(body).toContain(`text: ${long}\n`);
  });
  test('markdown', () => expect(renderSimple('markdown', one)).toBe('> For God so loved. Indeed.\n>\n> — John 3:16-17 (NRSV)\n'));
  test('markdown, a quote per version', () => expect(renderSimple('markdown', data)).toBe(
    '> For God so loved. Indeed.\n>\n> — John 3:16-17 (NRSV)\n\n> For God so loved,\n>\n> — John 3:16-17 (KJV)\n'
  ));
  test('text, each version named when there are several, a blank line between them', () => {
    expect(renderSimple('text', data)).toBe('NRSV: For God so loved. Indeed.\n\nKJV: For God so loved,\n');
    expect(renderSimple('text', one)).toBe('For God so loved. Indeed.\n');
  });
  test('markdown and text leave out a version with no verses', () => {
    expect(renderSimple('markdown', withEmpty)).toBe(renderSimple('markdown', data));
    expect(renderSimple('text', withEmpty)).toBe(renderSimple('text', data));
  });
  test('text from blocks: a blank line between blocks, a line per poetry line, two spaces per indent; a line-break paragraph is one line on', () => {
    // Struck text is left out of plain text, as plainText leaves it out
    expect(simpleData(psalm).text).toBe('Of David.\n\nBless the Lord, O my soul,\n  and all that is within me\n\nBless him\n\nWho forgives,\n  who heals.');
    // verses stay one plain text per verse
    expect(simpleData(psalm).verses[0]).toEqual({ chapter: 103, verse: 1, text: 'Of David. Bless the Lord, O my soul, and all that is within me' });
  });
  test('passages are blocks too: a blank line between them', () => {
    const two = { ...one, passages: [one.passages[0], { headings: {}, blocks: { NRSV: [para(piece(3, 18, true, [{ text: 'Next.' }]))] }, verses: [{ id: 3, chapter: 3, verse: 18, texts: { NRSV: 'Next.' } }] }] };
    expect(simpleData(two).text).toBe('For God so loved. Indeed.\n\nNext.');
  });
  test('markdown: a blockquote paragraph per block, poetry lines with hard breaks, indents as em spaces, marks, the reference last', () => {
    expect(renderSimple('markdown', psalm)).toBe(
      '> Of David.\n>\n' +
      '> Bless the Lord, O my soul,  \n> &emsp;and all that is *within* **me**\n>\n' +
      '> Bless <sup>him</sup> ~~not~~\n>\n' +
      '> Who forgives,  \n> &emsp;who heals.\n>\n' +
      '> — Psalm 103:1-3 (NRSV)\n'
    );
  });
  test('text prints the text with its breaks', () => {
    expect(renderSimple('text', psalm)).toBe(simpleData(psalm).text + '\n');
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
