import { describe, test, expect, vi } from 'vitest';

// The presenters import the real repository and lookup service; stub the DB so importing is safe.
vi.mock('../../src/data/db/connection.js', () => ({ default: { query: async () => [] } }));

const { rawData } = await import('../../src/presentation/presenters/formats/raw.js');
const { plainFor } = await import('../../src/presentation/presenters/formats/plain.js');
const { phpJson } = await import('../../src/presentation/legacy/phpJson.js');

// KJV (public domain) rows, shaped as the PHP site's mysqli returned them (all strings).
const KJV = {
  1: { verse_id: '1', verse: '1', format: 'prose', version: 'KJV', text: '§¶In the beginning God created the heaven and the earth.' },
  2: { verse_id: '2', verse: '2', format: 'prose', version: 'KJV', text: 'And the earth was without form, and void.' },
  26137: { verse_id: '26137', verse: '16', format: 'prose', version: 'KJV', text: '¶For God so loved the world.' },
};

function stubRepo(byVersion) {
  return {
    findRawVerses: async (version, ids) => (byVersion[version] ? ids.map(id => byVersion[version][id]).filter(Boolean) : []),
    findVersesInOrder: async (version, ids) => (byVersion[version] ? ids.map(id => byVersion[version][id]).filter(Boolean) : []),
    findIndexVerses: async ids => ids.map(id => ({ verse_id: String(id), verse_scripture: 'index--text' })),
    loadHeading: async id => (String(id) === '1'
      ? { id: 'h1', version: 'KJV', verse_id: '1', prev_id: null, title: 'Genesis', last: 1533 }
      : null),
  };
}

describe('raw format', () => {
  test('keys verses by id, adds headings for § verses, keeps ids as strings', async () => {
    const data = await rawData({ ref: 'gen.1.1-2', versions: { KJV: 'KJV' } }, null, stubRepo({ KJV }));
    expect(data).toEqual({
      1: { headings: { title: 'Genesis', last: 1533 }, verse_id: '1', verse: '1', format: 'prose', text: KJV[1].text },
      2: { verse_id: '2', verse: '2', format: 'prose', text: KJV[2].text },
    });
    expect(Object.keys(data[1])).toEqual(['headings', 'verse_id', 'verse', 'format', 'text']);
    expect(phpJson(data)).toContain('"verse_id": "1"');
  });

  test('null when a block\'s verse_ids is not an array (PHP 7 array_merge gave null): /acts.28.31-rom.1.1;16.1', async () => {
    const any = { findRawVerses: async (version, ids) => ids.map(id => ({ verse_id: String(id), verse: '1', format: 'prose', text: 'x' })), loadHeading: async () => null };
    expect(await rawData({ ref: 'acts.28.31-rom.1.1', versions: { KJV: 'KJV' } }, null, any)).not.toBeNull();
    expect(await rawData({ ref: 'acts.28.31-rom.1.1;16.1', versions: { KJV: 'KJV' } }, null, any)).toBeNull();
  });

  test('defaults to LDS and gives null when nothing is found', async () => {
    expect(await rawData({ ref: 'gen.1.1', versions: null }, null, stubRepo({ KJV }))).toBeNull();
  });
});

describe('plain format', () => {
  const blocks = [
    { orig: 'John 3:16', book: 'John', verse_ids: [26137] },
    { orig: 'Genesis Genesis 1:1-2', book: 'Genesis', verse_ids: [1, 2] },
  ];

  test('blocks joined by a blank line, trailing space kept before it', async () => {
    expect(await plainFor(blocks, { KJV: 'KJV' }, stubRepo({ KJV }))).toBe(
      'For God so loved the world. \n\nIn the beginning God created the heaven and the earth. And the earth was without form, and void.'
    );
  });

  test('falls back to the verse index text when no version has the passage', async () => {
    expect(await plainFor([blocks[0]], { WEB: 'WEB' }, stubRepo({}))).toBe('index&mdash; text'); // flattenText spaces the entity's ";" like any punctuation
  });

  test('a block with no verses renders the not-found text', async () => {
    expect(await plainFor([{ orig: 'Nowhere 1', book: 'Nowhere', verse_ids: [] }], null, stubRepo({}))).toBe('Nowhere 1 \n\nNo scripture verses found.');
  });
});
