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

  test('a left side that is not a reference is an edition of the right one', async () => {
    const page = await svc.build('1830~kjv/alp.2.1');
    expect(page.lver).toBe('LDS'); // the fake labels every version but KJV as LDS
    expect(page.title).toBe('Alpha 2:1 ~ Alpha 2:1');
  });
});
