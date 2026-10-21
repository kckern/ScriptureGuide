import { describe, test, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../../src/data/db/connection.js', () => ({ default: { query: (...a) => query(...a) } }));
const { HeadingRepository } = await import('../../src/data/repositories/HeadingRepository.js');

// A fake database: heading starts (footer = 0) per version, heading rows, and last verse ids.
function fakeDb({ starts = {}, rows = [], last = {} } = {}) {
  return async (sql, params = []) => {
    if (/SELECT DISTINCT verse_id, book_id FROM scripture_headings/.test(sql)) {
      return (starts[params[0]] ?? []).map(([verse_id, book_id]) => ({ verse_id, book_id }));
    }
    if (/MAX\(verse_id\) AS last FROM scripture_verses/.test(sql)) return [{ last: last[params[0]] ?? null }];
    if (/FROM scripture_headings h\s+WHERE h\.verse_id IN/.test(sql)) {
      const [ids, version] = params;
      return rows.filter(r => r.version === version && ids.includes(r.verse_id));
    }
    if (/FROM scripture_headings h\s+WHERE h\.version = \? AND h\.book_id = \? AND h\.verse_id = \?/.test(sql)) {
      const [version, bookId, verseId] = params;
      return rows.filter(r => r.version === version && r.book_id === bookId && r.verse_id === verseId);
    }
    throw new Error(`unexpected query: ${sql}`);
  };
}

let repo;
beforeEach(() => { query.mockReset(); repo = new HeadingRepository(); });

// scriptutil::loadHeading: a section runs to the version's next heading in any book, and the
// version's last heading runs to its last verse.
describe('heading ranges (scriptutil::loadHeading)', () => {
  const db = {
    starts: { KJV: [[10, 1], [20, 2], [30, 2]], NIV: [[15, 1]] },
    rows: [
      { verse_id: 10, version: 'KJV', book_id: 1, type: 'heading', text: 'A', seq: 1 },
      { verse_id: 10, version: 'KJV', book_id: 1, type: 'title', text: 'Gen', seq: 0 },
      { verse_id: 20, version: 'KJV', book_id: 2, type: 'heading', text: 'B', seq: 1 },
      { verse_id: 30, version: 'KJV', book_id: 2, type: 'heading', text: 'C', seq: 1 },
    ],
    last: { KJV: 42, NIV: 99 },
  };
  test('a heading runs to the next heading of its version, in any book', async () => {
    query.mockImplementation(fakeDb(db));
    const rows = await repo.findByVerseIds([10, 11], 'KJV');
    expect(rows.map(r => [r.verse_id, r.last_verse_id])).toEqual([[10, 19], [10, 19]]);
  });
  test('the last heading of a version runs to its last verse', async () => {
    query.mockImplementation(fakeDb(db));
    const rows = await repo.findByVerseIds([30], 'KJV');
    expect(rows[0].last_verse_id).toBe(42);
  });
  test('the chapter heading is the latest heading of the book at or before the verse', async () => {
    query.mockImplementation(fakeDb(db));
    // verse 25 is in book 2: its section starts at 20 and ends before 30
    const h = await repo.findChapterHeading(26, 2, 'KJV');
    expect(h).toMatchObject({ verse_id: 20, version: 'KJV', heading: 'B', last: 29 });
  });
  test('a heading of another book does not count, but the next one does', async () => {
    query.mockImplementation(fakeDb(db));
    // book 2 has no heading at or before 15; book 1's heading at 10 runs to 19 (next in book 2)
    expect(await repo.findChapterHeading(16, 2, 'KJV')).toBeNull();
    expect(await repo.findChapterHeading(16, 1, 'KJV')).toMatchObject({ verse_id: 10, heading: 'A', title: 'Gen', last: 19 });
  });
  test('a new section starts at its own verse; otherwise the lookup starts one verse earlier', async () => {
    query.mockImplementation(fakeDb(db));
    expect((await repo.findChapterHeading(20, 2, 'KJV', true)).verse_id).toBe(20);
    expect(await repo.findChapterHeading(20, 2, 'KJV', false)).toBeNull();
  });
  test('heading starts are loaded once per version', async () => {
    query.mockImplementation(fakeDb(db));
    await repo.findByVerseIds([10], 'KJV');
    await repo.findChapterHeading(26, 2, 'KJV');
    await repo.findByVerseIds([20], 'KJV');
    const loads = query.mock.calls.filter(([sql]) => /SELECT DISTINCT verse_id, book_id/.test(sql));
    expect(loads.map(c => c[1])).toEqual([['KJV']]);
  });
  test('a failed load is retried', async () => {
    const ok = fakeDb(db);
    let fail = true;
    query.mockImplementation((sql, params) => {
      if (fail && /SELECT DISTINCT verse_id, book_id/.test(sql)) { fail = false; return Promise.reject(new Error('gone')); }
      return ok(sql, params);
    });
    await expect(repo.findByVerseIds([10], 'KJV')).rejects.toThrow('gone');
    expect((await repo.findByVerseIds([10], 'KJV'))[0].last_verse_id).toBe(19);
  });
});

describe('findVersionLastVerseId', () => {
  test('is queried once per version', async () => {
    query.mockResolvedValue([{ last: 7 }]);
    expect(await repo.findVersionLastVerseId('MEMO1')).toBe(7);
    expect(await repo.findVersionLastVerseId('MEMO1')).toBe(7);
    expect(query).toHaveBeenCalledTimes(1);
    await repo.findVersionLastVerseId('MEMO2');
    expect(query).toHaveBeenCalledTimes(2);
  });
});

describe('findParallels', () => {
  test('chapter sizes of every source chapter come from one query', async () => {
    const refs = [
      { src_verse_id: 100, dst_verse_id: 1, significant: 1, src_chapter: 1, src_verse: 1, src_book_id: 7, src_book_slug: 'Gen.', src_book_title: 'Genesis', vol_org: 'jsto' },
      { src_verse_id: 101, dst_verse_id: 2, significant: 1, src_chapter: 1, src_verse: 2, src_book_id: 7, src_book_slug: 'Gen.', src_book_title: 'Genesis', vol_org: 'jsto' },
      { src_verse_id: 200, dst_verse_id: 2, significant: 1, src_chapter: 2, src_verse: 1, src_book_id: 7, src_book_slug: 'Gen.', src_book_title: 'Genesis', vol_org: 'jsto' },
    ];
    query.mockImplementation(async (sql, params) => {
      if (/FROM scripture_references r/.test(sql)) return refs;
      if (/COUNT\(\*\) AS cnt FROM lds_scriptures_verses/.test(sql)) {
        const sizes = { '7:1': 2, '7:2': 5 };
        return params[0].map(([b, c]) => ({ book_id: b, chapter: c, cnt: sizes[`${b}:${c}`] }));
      }
      throw new Error(`unexpected query: ${sql}`);
    });
    const out = await repo.findParallels([{ from: 1, to: 2, ids: [1, 2], verseNums: [1, 2], bookSlug: 'gen', chapter: 1, firstVerse: 1, lastVerse: 2, wholeChapter: true }], 'KJV');
    expect(query.mock.calls.filter(([sql]) => /COUNT\(\*\)/.test(sql))).toHaveLength(1);
    // chapter 1 is whole (2 of 2 verses), chapter 2 is not (1 of 5)
    expect(out[1]).toBe('JST*kjv/gen.1~gen.1;2.1');
  });
});
