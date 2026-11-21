import { describe, test, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { alignRows, parseSides, defaultVersion, ParallelService } from '../../src/services/ParallelService.js';
import { Reference } from '../../src/domain/entities/Reference.js';

const ref = (s, d, standin = 1, significant = 1) => ({ src_verse_id: s, dst_verse_id: d, standin, significant });
const none = { forward: [], backward: [] };
const md5 = s => createHash('md5').update(s).digest('hex');
const plain = rows => rows.map(({ key, left, right }) => ({ key, left, right }));

describe('parseSides', () => {
  test('splits version and reference on each side', () => {
    expect(parseSides('kjv/isa.2.1~2ne.12.1')).toEqual({ left: { ver: 'kjv', ref: 'isa.2.1' }, right: { ver: '', ref: '2ne.12.1' } });
    expect(parseSides('KJV/isa.2~LDS/2.ne.12')).toEqual({ left: { ver: 'kjv', ref: 'isa.2' }, right: { ver: 'lds', ref: '2.ne.12' } });
    expect(parseSides('john.3')).toBeNull();
  });
});

describe('defaultVersion', () => {
  test('by verse id range', () => {
    expect(defaultVersion([1, 2])).toBe('LDS');
    expect(defaultVersion([42000])).toBe('LEC');
    expect(defaultVersion([50000])).toBe('JST');
    expect(defaultVersion([])).toBeNull();
  });
});

describe('alignRows', () => {
  test('without cross references the sides go verse by verse, extra verses on their own rows', () => {
    const { rows, anymatches, sigs } = alignRows({ leftids: [10, 11], rightids: [100, 101, 102], references: none });
    expect(plain(rows)).toEqual([
      { key: 0, left: [10], right: [100] },
      { key: 1, left: [11], right: [101] },
      { key: 2, left: [], right: [102] },
    ]);
    expect(anymatches).toBe(false);
    expect(sigs.has(10)).toBe(true);
  });

  test('with an empty left side the right verses are numbered from 1 (PHP $i++ on an unset $i)', () => {
    const { rows } = alignRows({ leftids: [], rightids: [100, 101], references: none });
    expect(plain(rows)).toEqual([
      { key: 1, left: [], right: [100] },
      { key: 2, left: [], right: [101] },
    ]);
  });

  test('matched verses share a row keyed by the left verse id', () => {
    const { rows, found, index2d } = alignRows({
      leftids: [10, 11], rightids: [100, 101], references: { forward: [ref(10, 100), ref(11, 101)], backward: [] },
    });
    expect(plain(rows)).toEqual([{ key: 10, left: [10], right: [100] }, { key: 11, left: [11], right: [101] }]);
    expect([...found]).toEqual([10, 11]);
    expect(index2d.get('10|100').std.has(1)).toBe(true);
    expect(index2d.get('100|10').std.has(1)).toBe(true);
  });

  test('references stored in the other direction match too', () => {
    const { rows } = alignRows({ leftids: [10], rightids: [100], references: { forward: [], backward: [ref(100, 10)] } });
    expect(plain(rows)).toEqual([{ key: 10, left: [10], right: [100] }]);
  });

  test('unmatched runs between matches are placed between the matched rows', () => {
    const { rows } = alignRows({
      leftids: [10, 11, 12, 13], rightids: [100, 101, 102, 103],
      references: { forward: [ref(10, 100), ref(13, 103)], backward: [] },
    });
    expect(plain(rows)).toEqual([
      { key: 10, left: [10], right: [100] },
      { key: `12.1.103.${md5('{"101":101,"102":102}')}`, left: [11, 12], right: [101, 102] },
      { key: 13, left: [13], right: [103] },
    ]);
    // PHP's end($ids) moved the array pointer, so the row's verse_id attribute is the last id
    expect(rows[1].current).toEqual({ left: 11, right: 102 });
    expect(rows[0].current).toEqual({ left: 10, right: 100 });
  });
});

describe('ParallelService.build', () => {
  // Two synthetic one-verse passages that quote each other
  const VERSES = {
    10: { book_id: 1, chapter: 2, verse: 1, volume_id: 1, book_title: 'Alpha', book_title_short: 'Alp.', book_title_med: 'Alpha', text: '§¶The word that came.' },
    11: { book_id: 1, chapter: 2, verse: 2, volume_id: 1, book_title: 'Alpha', book_title_short: 'Alp.', book_title_med: 'Alpha', text: '¶And more.' },
    500: { book_id: 9, chapter: 12, verse: 1, volume_id: 3, book_title: 'Beta', book_title_short: 'Bet.', book_title_med: 'Beta', text: '§¶The word that came:' },
  };
  const refs = {
    parse: s => new Reference({ query: s, normalized: s, verseIds: { 'alp.2.1': [10], 'bet.12.1': [500] }[s] || [] }),
  };
  const repo = {
    verses: vi.fn(async (ids, version) => (version === 'XYZ' ? [] : ids.map(id => ({ verse_id: id, version: version === 'KJV' ? 'KJV' : 'LDS', text: VERSES[id].text, book: VERSES[id].book_title, chapter: VERSES[id].chapter, verse: VERSES[id].verse })))),
    indexVerses: vi.fn(async () => []),
    standinReferences: vi.fn(async () => ({ forward: [ref(10, 500)], backward: [] })),
    verseMeta: vi.fn(async ids => ids.filter(id => VERSES[id]).map(id => ({ verse_id: id, ...VERSES[id] }))),
    chapterVerseIds: vi.fn(async ids => (ids.includes(10) ? [10, 11] : ids.includes(500) ? [500] : [])),
    chapterMaxima: vi.fn(async pairs => pairs.map(p => ({ book_id: p.bookId, chapter: p.chapter, max: p.bookId === 1 ? 2 : 1 }))),
    faxIds: vi.fn(async () => new Set()),
  };
  const svc = new ParallelService({ refs, verses: { findBySlug: async () => null }, repo });

  test('builds title, headers, slugs and one quote row', async () => {
    const page = await svc.build('kjv/alp.2.1~bet.12.1');
    expect(page.title).toBe('Alpha 2:1 ~ Beta 12:1') // one-verse chapter: PHP still prints the verse;
    expect(page.lver).toBe('KJV');
    expect(page.rver).toBe('LDS');
    expect(page.limg).toBe('kjv');
    expect(page.rimg).toBe('lds-bom2');
    expect(page.swapslug).toBe('bet.12.1~kjv/alp.2.1');
    expect(page.fullslug).toBe('kjv/alp.2.1~bet.12.1');
    expect(page.chslug).toBe('KJV/alp.2~LDS/bet.12.1');
    expect(page.ischapter).toBe(false);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]).toMatchObject({
      id: 10,
      className: 'diffrow sig quote',
      left: { verseId: 10, ref: 'Alpha 2:1', slug: 'alpha.2.1', text: '  The word that came.' },
      right: { verseId: 500, ref: 'Beta 12:1', text: '  The word that came:' },
    });
  });

  test('each side\'s reference is looked up once per build', async () => {
    const parse = vi.fn(refs.parse);
    const counting = new ParallelService({ refs: { parse }, verses: { findBySlug: async () => null }, repo });
    await counting.build('alp.2.1~kjv/bet.12.1');
    expect(parse.mock.calls.filter(([s]) => s === 'alp.2.1')).toHaveLength(1);
  });

  test('a left side that is not a reference is an edition of the right one', async () => {
    const page = await svc.build('1830~kjv/alp.2.1');
    expect(page.lver).toBe('LDS'); // the fake labels every version but KJV as LDS
    expect(page.title).toBe('Alpha 2:1 ~ Alpha 2:1');
  });
});

describe('ParallelService.verseIds', () => {
  const refs = {
    parse: s => new Reference({ query: s, normalized: s, verseIds: { 'john.3.16': [26137] }[s] || [] }),
    resolve: vi.fn(async s => new Reference({ query: s, normalized: s, verseIds: { 'jst.john.3.16': [68942], 'jst.gen.1': [42600, 42601], 1835: [1835] }[s] || [] })),
  };
  const verses = { findBySlug: vi.fn(async slug => (slug === 'alp' ? { verseIds: [10] } : null)) };
  const svc = new ParallelService({ refs, verses, repo: {} });

  test('a reference the package reads stays as it was', async () => {
    expect(await svc.verseIds('john.3.16')).toEqual([26137]);
    expect(refs.resolve).not.toHaveBeenCalled();
  });
  test('JST references fall back to the verse index', async () => {
    expect(await svc.verseIds('jst.john.3.16')).toEqual([68942]);
    expect(await svc.verseIds('jst.gen.1')).toEqual([42600, 42601]);
  });
  test('a bare number is not read as a verse id: "1835~kjv/john.1" is an edition', async () => {
    refs.resolve.mockClear();
    expect(await svc.verseIds('1835')).toEqual([]);
    expect(refs.resolve).not.toHaveBeenCalled();
  });
  test('nothing found anywhere', async () => {
    expect(await svc.verseIds('zzz')).toEqual([]);
  });
});

describe('alignRows: one reference in two versions', () => {
  const spans = (side) => new Map(Object.entries(side).map(([k, v]) => [Number(k), v]));

  test('rows follow verse ids, each covering the union of both sides\' compound verses', () => {
    // left: 1, 2–3, 4, 5; right: 1, 2–4, 5
    const { rows } = alignRows({
      leftids: [1, 2, 4, 5], rightids: [1, 2, 5], references: none,
      spans: { left: spans({ 2: [2, 3] }), right: spans({ 2: [2, 3, 4] }) },
    });
    expect(plain(rows)).toEqual([
      { key: 0, left: [1], right: [1] },
      { key: 1, left: [2, 4], right: [2] },
      { key: 2, left: [5], right: [5] },
    ]);
    // a side of several cells names its last verse (the row's verse_id), as PHP's folded cells did
    expect(rows[1].current).toEqual({ left: 4, right: 2 });
  });

  test('overlapping compounds chain into one row', () => {
    // left: 1–2, 3–4; right: 1, 2–3, 4
    const { rows } = alignRows({
      leftids: [1, 3], rightids: [1, 2, 4], references: none,
      spans: { left: spans({ 1: [1, 2], 3: [3, 4] }), right: spans({ 2: [2, 3] }) },
    });
    expect(plain(rows)).toEqual([{ key: 0, left: [1, 3], right: [1, 2, 4] }]);
  });

  test('a verse one side lacks keeps its own row', () => {
    const { rows } = alignRows({ leftids: [1, 2, 3], rightids: [1, 3], references: none, spans: { left: new Map(), right: new Map() } });
    expect(plain(rows)).toEqual([
      { key: 0, left: [1], right: [1] },
      { key: 1, left: [2], right: [] },
      { key: 2, left: [3], right: [3] },
    ]);
  });

  test('different references still go side by side', () => {
    const { rows } = alignRows({ leftids: [10, 11], rightids: [100, 101], references: none, spans: { left: new Map(), right: new Map() } });
    expect(plain(rows)).toEqual([{ key: 0, left: [10], right: [100] }, { key: 1, left: [11], right: [101] }]);
  });

  test('side by side with a compound on one side leaves no empty ids or rows', () => {
    const { rows } = alignRows({ leftids: [10], rightids: [100], references: none, compounds: { AAA: { 10: 3 } }, lver: 'AAA', rver: 'BBB' });
    expect(plain(rows)).toEqual([{ key: 0, left: [10], right: [100] }]);
  });
});

describe('ParallelService.build: one reference in two versions with compound verses', () => {
  // AAA: 20, 21–22, 23, 24; BBB: 20–21, 22, 23–24 ("*" rows are compound filler)
  const TEXT = {
    AAA: { 20: '¶One.', 21: 'Two.', 22: '*', 23: 'Four.', 24: 'Five.' },
    BBB: { 20: '¶Uno.', 21: '*', 22: 'Tres.', 23: 'Cuatro.', 24: '*' },
  };
  const meta = id => ({ verse_id: id, book_id: 7, chapter: 1, verse: id - 19, volume_id: 3, book_title: 'Gamma', book_title_short: 'Gam.', book_title_med: 'Gamma' });
  const parse = s => new Reference({ query: s, normalized: s, verseIds: { 'gam.1': [20, 21, 22, 23, 24], 'gam.1.1': [20] }[s] || [] });
  const refs = { parse, resolve: async s => parse(s) };
  const repo = {
    verses: async (ids, version) => (TEXT[version] ? ids.map(id => ({ verse_id: id, version, text: TEXT[version][id], book: 'Gamma', chapter: 1, verse: id - 19 })) : []),
    indexVerses: async () => [],
    standinReferences: async () => ({ forward: [], backward: [] }),
    verseMeta: async ids => ids.map(meta),
    chapterVerseIds: async () => [20, 21, 22, 23, 24],
    chapterMaxima: async pairs => pairs.map(p => ({ book_id: p.bookId, chapter: p.chapter, max: 5 })),
    faxIds: async () => new Set(),
  };
  const svc = new ParallelService({ refs, verses: { findBySlug: async () => null }, repo });

  test('each row shows the same verses on both sides, every verse once', async () => {
    const page = await svc.build('aaa~bbb/gam.1');
    // a cell over its own compound verses has the short label; cells folded together the medium one
    expect(page.rows.map(r => [r.left.ref, r.right.ref])).toEqual([
      ['Gamma 1:1–3', 'Gamma 1:1–3'],
      ['Gamma 1:4–5', 'Gam. 1:4–5'],
    ]);
    expect(page.rows.map(r => [r.left.text, r.right.text].map(t => t.replace(/\s+/g, ' ').trim()))).toEqual([
      ['One. Two.', 'Uno. Tres.'],
      ['Four. Five.', 'Cuatro.'],
    ]);
    expect(page.rows.map(r => [r.left.slug, r.right.slug])).toEqual([['gamma.1.1-3', 'gamma.1.1-3'], ['gamma.1.4-5', 'gam.1.4-5']]);
  });

  test('a cell links by its own label, as PHP did', async () => {
    const one = await svc.build('aaa~aaa/gam.1.1');
    expect(one.rows[0].left).toMatchObject({ ref: 'Gamma 1:1', slug: 'gamma.1.1' });
  });
  test('rows by verse are numbered from 0, as PHP\'s side-by-side rows were (the row ids on the page)', async () => {
    const page = await svc.build('aaa~bbb/gam.1');
    expect(page.rows.map(r => r.id)).toEqual([0, 1]);
  });
});

describe('ParallelService.build headers', () => {
  test('one space after the semicolon', async () => {
    const VERSES = { 30: 9, 40: 11 };
    const svc = new ParallelService({
      refs: { parse: s => new Reference({ query: s, normalized: s, verseIds: s === 'gam.9;11' ? [30, 40] : [] }) },
      verses: { findBySlug: async () => null },
      repo: {
        verses: async (ids, version) => ids.map(id => ({ verse_id: id, version: 'AAA', text: 'X.', book: 'Gamma', chapter: VERSES[id], verse: 1 })),
        indexVerses: async () => [],
        standinReferences: async () => ({ forward: [], backward: [] }),
        verseMeta: async ids => ids.map(id => ({ verse_id: id, book_id: 7, chapter: VERSES[id], verse: 1, volume_id: 3, book_title: 'Gamma', book_title_short: 'Gam.', book_title_med: 'Gamma' })),
        chapterVerseIds: async () => [30, 40],
        chapterMaxima: async pairs => pairs.map(p => ({ book_id: p.bookId, chapter: p.chapter, max: 1 })),
        faxIds: async () => new Set(),
      },
    });
    const page = await svc.build('aaa/gam.9;11~bbb/gam.9;11');
    expect(page.leftheader).not.toMatch(/\s{2}/);
    expect(page.htmlLeftheader).not.toMatch(/\s{2}/);
    expect(page.title).not.toMatch(/\s{2}/);
  });
});

describe('ParallelService.build: a side naming no version', async () => {
  const { knownVersions } = await import('../../src/domain/rules/versionNotice.js');
  const VERSES = { 10: { book_id: 1, book_title: 'Alpha', book_title_short: 'Alp.', book_title_med: 'Alpha', chapter: 2, verse: 1, volume_id: 3 } };
  const refs = { parse: s => new Reference({ query: s, normalized: s, verseIds: s === 'alp.2.1' ? [10] : [] }) };
  refs.resolve = async s => refs.parse(s);
  const repo = {
    verses: async (ids, version) => (['KJV', 'LDS'].includes(String(version).toUpperCase()) ? ids.map(id => ({ verse_id: id, version: String(version).toUpperCase(), text: 'Word.', book: 'Alpha', chapter: 2, verse: 1 })) : []),
    indexVerses: async () => [],
    standinReferences: async () => ({ forward: [], backward: [] }),
    verseMeta: async ids => ids.filter(id => VERSES[id]).map(id => ({ verse_id: id, ...VERSES[id] })),
    chapterVerseIds: async () => [10],
    chapterMaxima: async pairs => pairs.map(p => ({ book_id: p.bookId, chapter: p.chapter, max: 1 })),
    faxIds: async () => new Set(),
  };
  const svc = new ParallelService({ refs, verses: { findBySlug: async () => null }, repo });
  const known = knownVersions([{ id: 'KJV', volumes: 'ot,nt' }, { id: 'LDS', volumes: 'bom' }, { id: '1830', volumes: 'bom' }]);
  test('notes it and names the versions shown', async () => {
    const page = await svc.build('hbrs/alp.2.1~kjv/alp.2.1', { known });
    expect(page.versionNote).toBe('There is no version "HBRS". Showing LDS and KJV.');
  });
  test('an unknown edition on the left is noted too', async () => {
    expect((await svc.build('zzz~kjv/alp.2.1', { known })).versionNote).toBe('There is no version "ZZZ". Showing LDS and KJV.');
  });
  test('known versions, volume words and edition years are not', async () => {
    expect((await svc.build('kjv/alp.2.1~lds/alp.2.1', { known })).versionNote).toBeNull();
    expect((await svc.build('1830~kjv/alp.2.1', { known })).versionNote).toBeNull();
    expect((await svc.build('bom/alp.2.1~1853/alp.2.1', { known })).versionNote).toBeNull();
  });
  test('without the version list (the API): no note', async () => {
    expect((await svc.build('hbrs/alp.2.1~kjv/alp.2.1')).versionNote).toBeUndefined();
  });
});
