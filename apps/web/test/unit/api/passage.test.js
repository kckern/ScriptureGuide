import { describe, test, expect } from 'vitest';
import { buildPassage, passageSlug } from '../../../src/api/v1/passage.js';
import { Reference } from '../../../src/domain/entities/Reference.js';

// John 3:15-19 (ids 26136-26140), NRSV and KJV. NRSV has a heading at 3:1 (26122).
const INDEX = { 26136: 15, 26137: 16, 26138: 17, 26139: 18, 26140: 19 };
const TEXT = {
  NRSV: { 26137: '¶“For God so loved the world.', 26138: '“Indeed, God did not send.', 26140: 'And this is the judgment.' },
  KJV: { 26137: '¶For God so loved the world.', 26138: 'For God sent not his Son.', 26140: 'And this is the condemnation.' },
};
// The shape of ApiRepository.versions(): lower-case id → { id, name, lang }
const NAMES = new Map([['nrsv', { id: 'NRSV', name: 'New Revised Standard Version', lang: 'en' }], ['kjv', { id: 'KJV', name: 'King James Version', lang: 'en' }], ['lds', { id: 'LDS', name: 'LDS', lang: 'en' }]]);

// Index rows: John 3:15-19, Romans 8:28, JST John 3:16-18
const john = (id, verse) => ({ verse_id: id, book_id: 43, chapter: 3, verse, book_title: 'John', book_title_short: 'John' });
const ROWS = {
  ...Object.fromEntries(Object.entries(INDEX).map(([id, verse]) => [id, john(Number(id), verse)])),
  28145: { verse_id: 28145, book_id: 45, chapter: 8, verse: 28, book_title: 'Romans', book_title_short: 'Rom.' },
  60250: { verse_id: 60250, book_id: 131, chapter: 3, verse: 16, book_title: 'JST John', book_title_short: 'JST John' },
  60251: { verse_id: 60251, book_id: 131, chapter: 3, verse: 17, book_title: 'JST John', book_title_short: 'JST John' },
  60252: { verse_id: 60252, book_id: 131, chapter: 3, verse: 18, book_title: 'JST John', book_title_short: 'JST John' },
};
const fakeRepo = (extra = {}) => ({
  versions: async () => NAMES,
  indexRows: async ids => ids.map(id => ROWS[id]).filter(Boolean),
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
  // Verse ids; looked up again by name, the first piece would come back short
  '26137-26139,28145': ['John 3:16-18; Romans 8:28', [26137, 26138, 26139, 28145]],
  'John 3:16-18': ['John 3:16-18', [26137]],
  'Romans 8:28': ['Romans 8:28', [28145]],
  // A piece whose start can't be found
  'john3.16-17,zz': ['John 3:16-17; Zz 1:1', [26137, 26138, 26140]],
  // Pieces that overlap
  'john3.15-17,16': ['John 3:15-17; 3:16', [26136, 26137, 26138, 26137]],
  'John 3:15-17': ['John 3:15-17', [26136, 26137, 26138]],
  'John 3:16': ['John 3:16', [26137]],
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

  test('pieces keep the verse ids of the whole reference', async () => {
    const data = await build({ reference: '26137-26139,28145', versions: ['NRSV'], options: ['ids'] });
    expect(data.reference.map(r => r.label)).toEqual(['John 3:16-18', 'Romans 8:28']);
    expect(data.passages.map(p => p.verses.map(v => v.id))).toEqual([[26137, 26138, 26139], [28145]]);
  });

  test('a piece whose start can\'t be found is dropped; its ids stay with the piece before', async () => {
    const data = await build({ reference: 'john3.16-17,zz', versions: ['NRSV'], options: ['ids'] });
    expect(data.reference.map(r => r.label)).toEqual(['John 3:16-17']);
    expect(data.passages.flatMap(p => p.verses.map(v => v.id))).toEqual([26137, 26138, 26140]);
  });

  test('overlapping pieces each keep their own verses', async () => {
    const data = await build({ reference: 'john3.15-17,16', versions: ['NRSV'], options: ['ids'] });
    expect(data.reference.map(r => r.label)).toEqual(['John 3:15-17', 'John 3:16']);
    expect(data.passages.map(p => p.verses.map(v => v.id))).toEqual([[26136, 26137, 26138], [26137]]);
  });

  test('ids option loads no text', async () => {
    const noText = fakeRepo({ verses: async () => { throw new Error('text loaded'); } });
    const data = await build({ reference: 'john3.16-17', versions: ['NRSV'], options: ['ids'] }, { repo: noText });
    expect(data.passages[0].verses.map(v => v.id)).toEqual([26137, 26138]);
  });

  test('a heading inside the passage starts a new passage with that heading, once even when it has several rows', async () => {
    const asked = [];
    const starts = fakeRepo({
      // Rows come in seq order; the last one for a verse is the heading next to the text
      headingStarts: async (_ids, version) => (version === 'NRSV' ? [{ verse_id: 26138, text: 'Wider' }, { verse_id: 26138, text: 'Narrower' }] : []),
      headingAt: async (id, _book, version) => { asked.push([id, version]); return version === 'NRSV' ? 'Nicodemus Visits Jesus' : null; },
    });
    const data = await build({ reference: 'john3.16-17', versions: ['NRSV', 'KJV'] }, { repo: starts });
    expect(data.passages.map(p => p.verses.map(v => v.id))).toEqual([[26137], [26138]]);
    expect(data.passages.map(p => p.headings)).toEqual([{ NRSV: 'Nicodemus Visits Jesus', KJV: null }, { NRSV: 'Narrower', KJV: null }]);
    // headingAt only where no heading starts: not for NRSV at 26138
    expect(asked).toEqual([[26137, 'NRSV'], [26137, 'KJV'], [26138, 'KJV']]);
  });

  test('parallels name the passages that stand in for these verses, one per run of verses', async () => {
    const linked = fakeRepo({ parallelSources: async () => [28145, 60250, 60251, 60252] });
    const data = await build({ reference: 'john3.16-17', versions: ['NRSV'] }, { repo: linked });
    expect(data.parallels).toEqual([
      { reference: 'Romans 8:28', slug: 'rom.8.28' },
      { reference: 'JST John 3:16-18', slug: 'jst.john.3.16-18' },
    ]);
  });

  test('slugs and the web link use the short title', async () => {
    const data = await build({ reference: '26137-26139,28145', versions: ['NRSV'] });
    expect(data.reference.map(r => r.slug)).toEqual(['john.3.16-18', 'rom.8.28']);
    expect(data.links.web).toBe('https://scripture.guide/nrsv/john.3.16-18;rom.8.28');
  });

  test('no version asked for: the default version for the verses, and no version in the link', async () => {
    const data = await build({ reference: 'john3.16-17', versions: [] }, { repo: fakeRepo({ verses: async ids => ids.map(id => ({ verse_id: id, text: 'x' })) }) });
    expect(data.versions.map(v => v.id)).toEqual(['LDS']);
    expect(data.links.web).toBe('https://scripture.guide/john.3.16-17');
  });

  test('no default version has the verses: LDS, and the error says it was the default', async () => {
    const empty = fakeRepo({ verses: async () => [] });
    await expect(build({ reference: 'john3.16-17', versions: [] }, { repo: empty })).rejects.toMatchObject({
      code: 'not_in_version', message: 'No text found for John 3:16-17 in the default version (LDS).',
    });
  });

  test('verses missing from the index are an API error, not a crash', async () => {
    const noIndex = fakeRepo({ indexRows: async () => [] });
    await expect(build({ reference: 'john3.16-17', versions: ['NRSV'] }, { repo: noIndex })).rejects.toMatchObject({ code: 'not_in_version' });
  });

  test('a version with none of the verses', async () => {
    await expect(build({ reference: 'john3.16-17', versions: ['LDS'] })).rejects.toMatchObject({ code: 'not_in_version', message: 'LDS has no text for John 3:16-17.' });
    const empty = fakeRepo({ verses: async () => [] });
    await expect(build({ reference: 'john3.16-17', versions: ['NRSV', 'KJV'] }, { repo: empty })).rejects.toMatchObject({ message: 'None of NRSV, KJV has text for John 3:16-17.' });
  });

  test('the whole reference is looked up with room for more verses than the limit', async () => {
    const seen = [];
    const spy = { resolve: async (q, opts) => { seen.push(opts); return REFS[q] ? new Reference({ query: q, normalized: REFS[q][0], verseIds: REFS[q][1] }) : new Reference({ query: q, normalized: '', verseIds: [] }); } };
    await build({ reference: 'john3.16-17', versions: ['NRSV'] }, { refs: spy });
    expect(seen[0]).toEqual({ maxVerses: 5001 });
  });

  test('a long verse id list or too many pieces is refused before anything is looked up', async () => {
    const never = { resolve: async () => { throw new Error('resolved'); } };
    for (const reference of ['1-50000;50001-93000', '1-5001', '1-2500,2501-5001', Array(101).fill('john3.16').join(';')]) {
      await expect(build({ reference, versions: ['NRSV'] }, { refs: never })).rejects.toMatchObject({ code: 'reference_too_large' });
    }
  });

  test('only ";" separates pieces: a long "," verse list is looked up, as on the site', async () => {
    const looked = [];
    const refs = { resolve: async q => { looked.push(q); return new Reference({ query: q, normalized: 'John 3:16', verseIds: [26137] }); } };
    for (const reference of [`john3.${Array.from({ length: 101 }, (_, i) => i + 1).join(',')}`, Array(101).fill('1').join(',')]) {
      await build({ reference, versions: ['NRSV'] }, { refs });
      expect(looked.at(-1)).toBe(reference);
    }
  });

  test('more than 5000 verses is too large', async () => {
    const ids = Array.from({ length: 5001 }, (_, i) => i + 1);
    const big = { resolve: async q => new Reference({ query: q, normalized: 'Genesis 1-Exodus 2', verseIds: ids }) };
    await expect(build({ reference: 'big', versions: ['NRSV'] }, { refs: big })).rejects.toMatchObject({ code: 'reference_too_large' });
  });

  test('a reference that finds nothing is diagnosed', async () => {
    await expect(build({ reference: 'xyz9.9', versions: [] })).rejects.toMatchObject({ code: 'unknown_book' });
  });
});

describe('passageSlug', () => {
  test('book from the short title, then chapter and verses', () => {
    expect(passageSlug("Solomon's Song 2:1", 'Song.')).toBe('song.2.1');
    expect(passageSlug('1 Nephi 3:7', '1 Ne.')).toBe('1.ne.3.7');
    expect(passageSlug('Doctrine and Covenants 76:22', 'D&C')).toBe('d&c.76.22');
    expect(passageSlug('JST John 3:16-18', 'JST John')).toBe('jst.john.3.16-18');
    expect(passageSlug('Doctrine and Covenants 4', 'D&C')).toBe('d&c.4');
    expect(passageSlug('Genesis 1-2', 'Gen.')).toBe('gen.1-2');
  });
  test('a range across chapters, as the site writes it', () => {
    expect(passageSlug('Genesis 1:1-2:3', 'Gen.')).toBe('gen.1-2.3');
    expect(passageSlug('Genesis 1:5-2:3', 'Gen.')).toBe('gen.1.5-2.3');
  });
  test('without a short title, the label as a slug', () => {
    expect(passageSlug('Lectures on Faith 1:1', null)).toBe('lectures.on.faith.1.1');
  });
});

// The real reference lookup: a range written with book names is expanded past the package's
// default cap of 1000 verses, so the 5000-verse limit applies to it
describe('buildPassage: long ranges by name', async () => {
  const { default: referenceService } = await import('../../../src/services/ReferenceService.js');
  test('Genesis 1 to Deuteronomy 34 (5852 verses) is too large, not cut', async () => {
    await expect(build({ reference: 'gen1-deut34', versions: ['NRSV'] }, { refs: referenceService })).rejects.toMatchObject({ code: 'reference_too_large', message: 'The reference has more than 5000 verses. Ask for 5000 or fewer.' });
  });
  test('Genesis 1 to Exodus 40 (2746 verses) comes back whole; the site keeps the package cap', async () => {
    expect((await referenceService.resolve('gen1-ex40', { maxVerses: 5001 })).verseIds).toHaveLength(2746);
    expect((await referenceService.resolve('gen1-ex40')).verseIds).toHaveLength(1000);
  });
});
