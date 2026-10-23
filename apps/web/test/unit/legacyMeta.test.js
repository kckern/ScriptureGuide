import { describe, test, expect } from 'vitest';
import { metaFromRef, getBook, defaultVersions, bookOnlyQuery, bookOnlyBlock } from '../../src/presentation/legacy/meta.js';
import { metaOnly } from '../../src/presentation/presenters/formats/meta.js';

describe('metaFromRef (scriptures::loadMetaFromRef)', () => {
  test('single verse', () => {
    expect(metaFromRef('john.3.16')).toEqual([{ orig: 'John 3:16', book: 'John', verse_ids: [26137] }]);
  });

  test('verse range', () => {
    expect(metaFromRef('gen.1.1-5')).toEqual([{ orig: 'Genesis 1:1-5', book: 'Genesis', verse_ids: [1, 2, 3, 4, 5] }]);
  });

  test('cross-chapter range', () => {
    expect(metaFromRef('gen.1.30-2.3')).toEqual([{ orig: 'Genesis 1:30-2:3', book: 'Genesis', verse_ids: [30, 31, 32, 33, 34] }]);
  });

  test('compound reference repeats the book in later blocks, as PHP did', () => {
    expect(metaFromRef('john.3.16;gen.1.1')).toEqual([
      { orig: 'John 3:16', book: 'John', verse_ids: [26137] },
      { orig: 'Genesis Genesis 1:1', book: 'Genesis', verse_ids: [1] },
    ]);
  });

  test('a range across a book end is one "Multi" block, as cleanReference wrote it', () => {
    expect(metaFromRef('mal.4.5-matt.1.2')).toEqual([{ orig: 'Malachi 4:5-Matthew 1:2', book: 'Multi', verse_ids: [23144, 23145, 23146, 23147] }]);
  });

  test('a cross-book range after another piece is its own "Multi" block', () => {
    expect(metaFromRef('john.3.16;mal.4.5-matt.1.2')).toEqual([
      { orig: 'John 3:16', book: 'John', verse_ids: [26137] },
      { orig: 'Malachi 4:5-Matthew 1:2', book: 'Multi', verse_ids: [23144, 23145, 23146, 23147] },
    ]);
  });

  test('a bare piece after a "Multi" block takes the book before it, without doubling it', () => {
    expect(metaFromRef('john.3.16;mal.4.5-matt.1.2;3').map(b => [b.orig, b.book])).toEqual([
      ['John 3:16', 'John'], ['Malachi 4:5-Matthew 1:2', 'Multi'], ['John 3', 'John'],
    ]);
  });

  test('a bare piece after a leading "Multi" block has no book: PHP\'s getBook junk', () => {
    expect(metaFromRef('acts.28.31-rom.1.1;16.1')[1]).toEqual({ orig: ' 16:1', book: '', verse_ids: false });
    expect(metaFromRef('gen.50.26-ex.1.2;3.4')[1]).toEqual({ orig: '3: 3:4', book: '3:', verse_ids: [] });
  });

  test('a block after a "Multi" one still repeats its own book, as PHP did', () => {
    expect(metaFromRef('mal.4.6-matt.1.1;john.3.16').map(b => [b.orig, b.book])).toEqual([
      ['Malachi 4:6-Matthew 1:1', 'Multi'], ['John John 3:16', 'John'],
    ]);
  });

  test('a later block without a book takes the previous book', () => {
    expect(metaFromRef('gen.1.1;3.1')).toEqual([
      { orig: 'Genesis 1:1', book: 'Genesis', verse_ids: [1] },
      { orig: 'Genesis 3:1', book: 'Genesis', verse_ids: [57] },
    ]);
  });

  test('em dash in a book name becomes a space', () => {
    expect(metaFromRef('js-h.1.17')[0]).toMatchObject({ orig: 'Joseph Smith History 1:17', book: 'Joseph Smith History' });
  });

  test('verses after a comma stay in their block (cleanReference keeps "13:24-30, 36-43")', () => {
    const [block, ...rest] = metaFromRef('Matthew.13:24-30,.36-43');
    expect(rest).toEqual([]);
    expect(block.orig).toBe('Matthew 13:24-30, 36-43');
    expect(block.book).toBe('Matthew');
    expect(block.verse_ids).toEqual([23564, 23565, 23566, 23567, 23568, 23569, 23570, 23576, 23577, 23578, 23579, 23580, 23581, 23582, 23583]);
    expect(metaFromRef('john.3.16,18;gen.1.1').map(b => b.orig)).toEqual(['John 3:16, 18', 'Genesis Genesis 1:1']);
  });

  test('a piece the package cannot read adds no block', () => {
    expect(metaFromRef('xyzzy;john.3.16').map(b => b.orig)).toEqual(['John 3:16']);
  });

  test('many pieces skip the per-piece grouping', () => {
    const ref = Array.from({ length: 60 }, (_, i) => `ps.${i + 1}.1`).join(';');
    const t0 = performance.now();
    expect(metaFromRef(ref)).toHaveLength(60);
    expect(performance.now() - t0).toBeLessThan(250);
  });

  test('unknown reference gives no blocks', () => {
    expect(metaFromRef('nothing')).toEqual([]);
  });
});

describe('getBook', () => {
  test.each([
    ['John 3:16', '', 'John'],
    ['1 Nephi 1:1', '', '1 Nephi'],
    ['3:18', 'John', 'John'],
    [' Genesis 1:1', 'John', 'Genesis'],
  ])('%j', (ref, last, book) => expect(getBook(ref, last)).toBe(book));
});

describe('defaultVersions (scriptures::defaultVersions)', () => {
  test('standard works default to LDS after the requested versions', () => {
    expect(defaultVersions({ KJV: 'KJV' }, [1, 2])).toEqual({ KJV: 'KJV', LDS: 'LDS' });
    expect(defaultVersions(null, [26137])).toEqual({ LDS: 'LDS' });
  });
  test('LDS requested moves to the end', () => {
    expect(Object.keys(defaultVersions({ LDS: 'LDS', KJV: 'KJV' }, [1]))).toEqual(['KJV', 'LDS']);
  });
  test('other ranges', () => {
    expect(defaultVersions(null, [42600])).toEqual({ JST: 'JST' });
    expect(defaultVersions(null, [1, 31103])).toEqual({});
  });
});

describe('a book named alone (meta)', () => {
  test('is looked up as its first chapter', () => {
    expect(bookOnlyQuery('Song.of.Solomon')).toBe('Song of Solomon');
    expect(bookOnlyQuery('john.3')).toBeNull();
    expect(bookOnlyQuery('')).toBeNull();
  });
  test('is titled with the book title', () => {
    expect(bookOnlyBlock('Genesis', [1])).toEqual({ book: 'Genesis', orig: 'Genesis', verse_ids: [1] });
  });
  const meta = (ref, bookOnly = null, legacyBlocks = undefined) =>
    metaOnly({ config: { legacy: { ref, versions: null } }, query: {}, headers: {} }, { reference: { verseIds: [] }, bookOnly, legacyBlocks }, {});
  test('metaOnly lists the first chapter the controller resolved', async () => {
    expect(await meta('Song.of.Solomon', { book: "Solomon's Song", verseIds: [17539] }, [{ orig: 'x', book: 'x', verse_ids: [] }]))
      .toEqual([{ book: "Solomon's Song", orig: "Solomon's Song", verse_ids: [17539] }]);
  });
  test('anything else the package cannot read: the PHP blocks the controller built', async () => {
    const blocks = [{ orig: 'Farewell-speech', book: 'Multi', verse_ids: [null] }, { orig: ' 30', book: '', verse_ids: false }];
    expect(await meta('farewell-speech; 30', null, blocks)).toEqual(blocks);
  });
});

describe('ReferenceService.resolveBookOnly', async () => {
  const { ReferenceService } = await import('../../src/services/ReferenceService.js');
  const books = [
    { book_id: 22, book_title: "Solomon's Song", book_title_short: 'Song.', lds_org: 'song' },
    { book_id: 23, book_title: 'Isaiah', book_title_short: 'Isa.', lds_org: 'isa' },
    { book_id: 80, book_title: 'The Sealed Portion', book_title_short: 'TSP', lds_org: 'tsp' },
  ];
  const repo = { findAllBooks: async () => books, findIndexRowsByBook: async id => [{ verse_id: id * 100 }] };
  const svc = new ReferenceService(repo);
  test('whole names and aliases resolve to chapter 1', async () => {
    expect(await svc.resolveBookOnly('Song of Solomon')).toEqual({ book: "Solomon's Song", verseIds: [2200] });
    expect(await svc.resolveBookOnly('son')).toEqual({ book: "Solomon's Song", verseIds: [2200] });
    expect(await svc.resolveBookOnly('Isaiah')).toEqual({ book: 'Isaiah', verseIds: [2300] });
  });
  test('a prefix of a book name does not', async () => {
    expect(await svc.resolveBookOnly('the')).toBeNull();
    expect(await svc.resolveBookOnly('is')).toBeNull();
    expect(await svc.resolveBookOnly('and')).toBeNull();
  });
});
