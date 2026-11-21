import { describe, test, expect } from 'vitest';
import { buildPassage } from '../../../src/api/v1/passage.js';
import { Reference } from '../../../src/domain/entities/Reference.js';

// John 3:15-19 (ids 26136-26140), NRSV and KJV. NRSV has a heading at 3:1 (26122).
const INDEX = { 26136: 15, 26137: 16, 26138: 17, 26139: 18, 26140: 19 };
const TEXT = {
  NRSV: { 26137: '¶“For God so loved the world.', 26138: '“Indeed, God did not send.', 26140: 'And this is the judgment.' },
  KJV: { 26137: '¶For God so loved the world.', 26138: 'For God sent not his Son.', 26140: 'And this is the condemnation.' },
};
// The shape of ApiRepository.versions(): lower-case id → { id, name, lang }
const NAMES = new Map([['nrsv', { id: 'NRSV', name: 'New Revised Standard Version', lang: 'en' }], ['kjv', { id: 'KJV', name: 'King James Version', lang: 'en' }], ['lds', { id: 'LDS', name: 'LDS', lang: 'en' }]]);

const fakeRepo = (extra = {}) => ({
  versions: async () => NAMES,
  indexRows: async ids => ids.map(id => ({ verse_id: id, book_id: 43, chapter: 3, verse: INDEX[id], book_title: 'John' })),
  verses: async (ids, version) => ids.filter(id => TEXT[version]?.[id]).map(id => ({ verse_id: id, text: TEXT[version][id] })),
  headingStarts: async () => [],
  headingAt: async (_id, _book, version) => (version === 'NRSV' ? 'Nicodemus Visits Jesus' : null),
  parallelSources: async () => [],
  ...extra,
});
const repo = fakeRepo();
const REFS = {
  'john3.16-17': ['John 3:16-17', [26137, 26138]],
  'John 3:16-17': ['John 3:16-17', [26137, 26138]],
  'john3.16-17,19': ['John 3:16-17; 3:19', [26137, 26138, 26140]],
  'John 3:19': ['John 3:19', [26140]],
  60250: ['JST John 3:16', [60250]],
};
const refs = {
  resolve: async q => {
    const [normalized, verseIds] = REFS[q] ?? ['', []];
    return new Reference({ query: q, normalized, verseIds });
  },
};
const build = (request, deps = {}) => buildPassage({ options: [], ...request }, { repo, refs, ...deps });

describe('buildPassage', () => {
  test('one version', async () => {
    const data = await build({ reference: 'john3.16-17', versions: ['NRSV'] });
    expect(data).toMatchObject({
      api: 'v1',
      query: 'john3.16-17',
      versions: [{ id: 'NRSV', name: 'New Revised Standard Version', language: 'en', copyright: null }],
      reference: [{ label: 'John 3:16-17', book: 'John', slug: 'john.3.16-17', start: { chapter: 3, verse: 16 }, end: { chapter: 3, verse: 17 } }],
      parallels: [],
      links: { web: 'https://scripture.guide/nrsv/john.3.16-17' },
    });
    expect(data.passages).toEqual([{
      headings: { NRSV: 'Nicodemus Visits Jesus' },
      verses: [
        { id: 26137, chapter: 3, verse: 16, texts: { NRSV: '“For God so loved the world.' } },
        { id: 26138, chapter: 3, verse: 17, texts: { NRSV: '“Indeed, God did not send.' } },
      ],
    }]);
  });

  test('several versions share the verse list', async () => {
    const data = await build({ reference: 'john3.16-17', versions: ['NRSV', 'KJV'] });
    expect(data.passages[0].headings).toEqual({ NRSV: 'Nicodemus Visits Jesus', KJV: null });
    expect(data.passages[0].verses[0].texts).toEqual({ NRSV: '“For God so loved the world.', KJV: 'For God so loved the world.' });
    expect(data.links.web).toBe('https://scripture.guide/nrsv.kjv/john.3.16-17');
  });

  test('ids option drops text and headings', async () => {
    const data = await build({ reference: 'john3.16-17', versions: ['NRSV'], options: ['ids'] });
    expect(data.passages[0]).toEqual({ verses: [{ id: 26137, chapter: 3, verse: 16 }, { id: 26138, chapter: 3, verse: 17 }] });
  });

  test('html option adds a fragment per version', async () => {
    const data = await build({ reference: 'john3.16-17', versions: ['NRSV'], options: ['html'] });
    expect(data.passages[0].html.NRSV).toContain('<span class="verse" data-verse-id="26137"');
  });

  test('a reference in pieces: each piece is a reference entry and a passage; a piece without a book takes the one before', async () => {
    const data = await build({ reference: 'john3.16-17,19', versions: ['NRSV'] });
    expect(data.reference.map(r => r.label)).toEqual(['John 3:16-17', 'John 3:19']);
    expect(data.passages.map(p => p.verses.map(v => v.id))).toEqual([[26137, 26138], [26140]]);
    expect(data.links.web).toBe('https://scripture.guide/nrsv/john.3.16-17;john.3.19');
  });

  test('a heading inside the passage starts a new passage, once even when it has several rows', async () => {
    const starts = fakeRepo({ headingStarts: async () => [{ verse_id: 26138, text: 'A' }, { verse_id: 26138, text: 'B' }] });
    const data = await build({ reference: 'john3.16-17', versions: ['NRSV', 'KJV'] }, { repo: starts });
    expect(data.passages.map(p => p.verses.map(v => v.id))).toEqual([[26137], [26138]]);
  });

  test('parallels name the passages that stand in for these verses', async () => {
    const linked = fakeRepo({ parallelSources: async () => [60250] });
    const data = await build({ reference: 'john3.16-17', versions: ['NRSV'] }, { repo: linked });
    expect(data.parallels).toEqual([{ reference: 'JST John 3:16', slug: 'jst.john.3.16' }]);
  });

  test('no version asked for: the default version for the verses, and no version in the link', async () => {
    const data = await build({ reference: 'john3.16-17', versions: [] }, { repo: fakeRepo({ verses: async ids => ids.map(id => ({ verse_id: id, text: 'x' })) }) });
    expect(data.versions.map(v => v.id)).toEqual(['LDS']);
    expect(data.links.web).toBe('https://scripture.guide/john.3.16-17');
  });

  test('a version with none of the verses', async () => {
    await expect(build({ reference: 'john3.16-17', versions: ['LDS'] })).rejects.toMatchObject({ code: 'not_in_version' });
  });

  test('a reference that finds nothing is diagnosed', async () => {
    await expect(build({ reference: 'xyz9.9', versions: [] })).rejects.toMatchObject({ code: 'unknown_book' });
  });
});
