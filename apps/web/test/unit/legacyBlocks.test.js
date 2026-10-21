import { describe, test, expect } from 'vitest';
import { vi } from 'vitest';
import { LegacyBlockService, getRanges, allVerseIds } from '../../src/services/LegacyBlockService.js';
import { RequestBudget } from '../../src/domain/rules/requestBudget.js';

// A tiny lds_scriptures_verses: verse_title → verse_id
const TITLES = new Map([
  ['Genesis 1:1', 1], ['Genesis 1:2', 2], ['Genesis 1:3', 3],
  ['Genesis 2:1', 4], ['Genesis 2:2', 5],
  ['Lehi 1:1', 82292], ['Lehi 1:2', 82293],
  ['Book of Commandments 13:1', 89527], ['Book of Commandments 13:0', 89528],
  ['Book of Commandments 13:2', 89529], ['Book of Commandments 13:3', 89530],
]);
const fakeRepo = {
  calls: 0,
  async chapterMax(ref) {
    this.calls++;
    const verses = [...TITLES.keys()].filter(t => t.startsWith(`${ref}:`)).map(t => Number(t.slice(ref.length + 1)));
    return verses.length ? Math.max(...verses) : null;
  },
  maximaCalls: 0,
  // One query for every chapter of a book: "<book> <chapter>" → its last verse
  async chapterMaxima(book) {
    this.maximaCalls++;
    const out = new Map();
    for (const t of TITLES.keys()) {
      const m = t.match(/^(.*) (\d+):(\d+)$/);
      if (m && m[1] === book) {
        const key = `${m[1]} ${m[2]}`;
        out.set(key, Math.max(out.get(key) ?? 0, Number(m[3])));
      }
    }
    return out;
  },
  async verseIds(titles) {
    return titles.map(t => TITLES.get(t)).filter(id => id != null).sort((a, b) => a - b);
  },
  async referenceFromVerseIds(ids) {
    const byId = new Map([...TITLES].map(([t, id]) => [id, t]));
    return ids.filter(id => byId.has(id)).map(id => byId.get(id)).join('; ');
  },
};
const service = (opts) => new LegacyBlockService(fakeRepo, opts);

describe('LegacyBlockService.blocks (scriptures::loadMetaFromRef)', () => {
  test('an unknown book is a block without verses', async () => {
    expect(await service().blocks('blog')).toEqual([{ orig: 'Blog', book: 'Blog', verse_ids: [] }]);
  });

  test('a later piece without a book takes the last book, and a piece with one repeats it', async () => {
    expect(await service().blocks('north; 200')).toEqual([
      { orig: 'North', book: 'North', verse_ids: [] },
      { orig: 'North 200', book: 'North', verse_ids: [] },
    ]);
    expect((await service().blocks('plugins; demo')).map(b => b.orig)).toEqual(['Plugins', 'Demo Demo']);
  });

  test('a piece with no book at all has verse_ids false', async () => {
    expect(await service().blocks('v3; ')).toEqual([
      { orig: '3', book: '', verse_ids: false },
      { orig: '', book: '', verse_ids: false },
    ]);
  });

  test('an empty reference is one block with verse_ids false', async () => {
    expect(await service().blocks('')).toEqual([{ orig: '', book: '', verse_ids: false }]);
  });

  test('numeric references are verse ids; ids that match nothing give no book', async () => {
    expect(await service().blocks('99999999')).toEqual([{ orig: '', book: '', verse_ids: false }]);
    expect(await service().blocks('4')).toEqual([{ orig: 'Genesis 2:1', book: 'Genesis', verse_ids: [4] }]);
  });

  test('a book alone is its first chapter, looked up by verse title', async () => {
    expect(await service().blocks('lehi; 9')).toEqual([
      { orig: 'Lehi', book: 'Lehi', verse_ids: [82292, 82293] },
      { orig: 'Lehi 9', book: 'Lehi', verse_ids: [] },
    ]);
  });

  test('comma lists keep their chapter, verse 0 included, in verse id order', async () => {
    expect(await service().blocks('boc.13.1,0,3')).toEqual([
      { orig: 'Book of Commandments 13:1, 0, 3', book: 'Book of Commandments', verse_ids: [89527, 89528, 89530] },
    ]);
  });

  describe('multi-book range (a hyphen before a letter)', () => {
    test('unresolved ends give [null]; the book does not carry over', async () => {
      expect(await service().blocks('farewell-speech; 30')).toEqual([
        { orig: 'Farewell-speech', book: 'Multi', verse_ids: [null] },
        { orig: ' 30', book: '', verse_ids: false },
      ]);
    });

    test('the book before it still carries past it', async () => {
      expect(await service().blocks('amulonites; their-prayers; 5')).toEqual([
        { orig: 'Amulonites', book: 'Amulonites', verse_ids: [] },
        { orig: 'Their-prayers', book: 'Multi', verse_ids: [null] },
        { orig: 'Amulonites 5', book: 'Amulonites', verse_ids: [] },
      ]);
    });

    test('"1901 07" is the decimal id 1901.07, which matches nothing', async () => {
      expect(await service().blocks('1901-07-04-pioneers')).toEqual([
        { orig: '1901 07-04-pioneers', book: 'Multi', verse_ids: [null] },
      ]);
    });

    test('a resolved start with an unresolved end gives null', async () => {
      expect(await service().blocks('genesis 1-x')).toEqual([{ orig: 'Genesis 1-x', book: 'Multi', verse_ids: null }]);
    });

    test('an unresolved start runs from null through 1 to the end (the last verse of its chapter)', async () => {
      expect(await service().blocks('warrior-genesis2')).toEqual([
        { orig: 'Warrior-Genesis 2', book: 'Multi', verse_ids: [null, 1, 2, 3, 4, 5] },
      ]);
    });

    test('a later range holds the ids of the earlier ones too ($all_verse_ids is never reset)', async () => {
      expect((await service().blocks('a-b; warrior-genesis2')).map(b => b.verse_ids)).toEqual([
        [null],
        [null, null, 1, 2, 3, 4, 5],
      ]);
    });

    test('a range longer than the cap is a block without verses', async () => {
      expect(await service({ maxRange: 5 }).blocks('warrior-genesis2')).toEqual([
        { orig: 'Warrior-Genesis 2', book: 'Multi', verse_ids: [] },
      ]);
      expect((await service({ maxRange: 6 }).blocks('warrior-genesis2'))[0].verse_ids).toHaveLength(6);
    });
  });
});

describe('LegacyBlockService.blocks: cost of a long junk reference', () => {
  test('pieces past the request budget are blocks without a lookup', async () => {
    const blocks = await service().blocks('x1;x2;x3;x4;x5', new RequestBudget({ pieces: 3 }));
    expect(blocks.map(b => b.orig)).toEqual(['X 1', 'X X 2', 'X X 3', 'X X 4', 'X X 5']);
    const spy = vi.spyOn(fakeRepo, 'verseIds');
    await service().blocks('x1;x2;x3;x4;x5', new RequestBudget({ pieces: 3 }));
    expect(spy).toHaveBeenCalledTimes(3);
    spy.mockRestore();
  });

  test('chapter maxima: one query per book, whatever the number of chapters', async () => {
    fakeRepo.maximaCalls = 0;
    fakeRepo.calls = 0;
    const blocks = await service().blocks('junk.1-200; junk.1-200; genesis.1-2');
    expect(fakeRepo.maximaCalls).toBe(2);
    expect(fakeRepo.calls).toBe(0);
    expect(blocks[2].verse_ids).toEqual([1, 2, 3, 4, 5]);
  });

  test('a multi-book range looks up its two ends only', async () => {
    const svc = service();
    const spy = vi.spyOn(svc, 'firstVerseId');
    await svc.blocks('a-b-c-d-e-f');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test('a range counts against the verse budget of the request', async () => {
    expect((await service().blocks('warrior-genesis2', new RequestBudget({ verses: 3 })))[0].verse_ids).toEqual([]);
    expect((await service().blocks('warrior-genesis2', new RequestBudget({ verses: 7 })))[0].verse_ids).toHaveLength(6); // the end point's own verse counts too
  });

  test('database queries stop at the budget', async () => {
    const budget = new RequestBudget({ queries: 0 });
    expect(await service().blocks('genesis.1', budget)).toEqual([{ orig: 'Genesis 1', book: 'Genesis', verse_ids: [] }]);
  });
});

describe('getRanges (scriptutil::getRanges)', () => {
  test.each([
    ['John 3:16', 'John', ['3:16']],
    ['John 3', 'John', ['3: X-Y']],
    ['John', 'John', [': X-Y']],
    ['John 3-4', 'John', ['3: X-Y', '4: X-Y']],
    ['John 3, 5', 'John', ['3: X-Y', ' 5: X-Y']],
    ['John 3:16-4:2', 'John', ['3: 16-Y', '4: X-2']],
    ['John 3:16, 18', 'John', ['3:16', '3: 18']],
    ['John 3:1-2, 5', 'John', ['3:1-2', '3: 5']],
  ])('%j (%s) → %j', (ref, book, expected) => {
    expect(getRanges(ref, book)).toEqual(expected);
  });

  test('more than 200 chapters is false', () => {
    expect(getRanges('John 1-500', 'John')).toBe(false);
  });
});

describe('allVerseIds (index.php array_merge over the blocks)', () => {
  test('merges arrays; a block whose verse_ids is not an array makes it null (PHP 7 array_merge)', () => {
    expect(allVerseIds([{ verse_ids: [] }, { verse_ids: [null] }])).toEqual([null]);
    expect(allVerseIds([{ verse_ids: [null] }, { verse_ids: false }, { verse_ids: [3] }])).toBeNull();
    expect(allVerseIds([{ verse_ids: [1] }, { verse_ids: [2] }])).toEqual([1, 2]);
  });
});
