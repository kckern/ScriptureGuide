import { describe, it, test, expect } from 'vitest';
import {
  splitRuns,
  formatReference, referenceFromRows, slugifyRef, versionImg, isConsecutive,
} from '../../src/domain/rules/legacyReference.js';

// Synthetic book table: Genesis (book 1) chapters 1–3 with 31, 25, 24 verses, verse ids from 1;
// "John" (book 43) chapter 3 with 36 verses from id 1000.
function fixture(field = 'long') {
  const info = new Map();
  const max = new Map();
  let id = 1;
  for (const [chapter, n] of [[1, 31], [2, 25], [3, 24]]) {
    max.set(`1|${chapter}`, n);
    for (let v = 1; v <= n; v++) info.set(id++, { book: field === 'short' ? 'Gen.' : 'Genesis', bookId: 1, chapter, verse: v });
  }
  max.set('43|3', 36);
  for (let v = 1; v <= 36; v++) info.set(999 + v, { book: 'John', bookId: 43, chapter: 3, verse: v });
  return { info, chapterMax: (b, c) => max.get(`${b}|${c}`) };
}
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe('formatReference (referenceFromVerseIds)', () => {
  const { info, chapterMax } = fixture();
  const ref = ids => formatReference(ids, info, chapterMax);

  test('single verse', () => expect(ref([1])).toBe('Genesis 1:1'));
  test('verse range uses an en dash', () => expect(ref([1, 2, 3])).toBe('Genesis 1:1–3'));
  test('whole chapter', () => expect(ref(range(1, 31))).toBe('Genesis 1'));
  test('separate verses in a chapter', () => expect(ref([1, 2, 4])).toBe('Genesis 1:1–2,4'));
  test('cross-chapter range', () => expect(ref(range(30, 34))).toBe('Genesis 1:30–2:3'));
  test('whole chapters in a row', () => expect(ref(range(1, 56))).toBe('Genesis 1–2'));
  // PHP numbered the first segment 0 when the ids start at verse id 1 ($last_id + 1 with no
  // last id), and empty($multics[0]) is true: Genesis 1:1 ranges skip the cross-chapter branch
  test('a range from Genesis 1:1 into the next chapter, as live titles it', () => expect(ref(range(1, 34))).toBe('Genesis 1–2.3'));
  test('the same range from any other first verse', () => expect(ref(range(2, 34))).toBe('Genesis 1:2–2:3'));
  test('two books', () => expect(ref([1, 1015])).toBe('Genesis 1:1; John 3:16'));
  test('short book titles', () => {
    const s = fixture('short');
    expect(formatReference([1, 2], s.info, s.chapterMax)).toBe('Gen. 1:1–2');
  });
  test('unknown ids give an empty string', () => expect(ref([99999])).toBe(''));
});

const gen = (verse_id, chapter, verse, chapter_max = 24) =>
  ({ verse_id, book_id: 1, chapter, verse, chapter_max, book_title: 'Genesis', book_title_short: 'Gen.' });

describe('referenceFromRows (AJAX endpoints: referenceFromVerseIds over verse rows)', () => {
  it('formats a single verse and a range with an en dash', () => {
    expect(referenceFromRows([gen(549, 22, 1)], 'book_title_short')).toBe('Gen. 22:1');
    expect(referenceFromRows([gen(549, 22, 1), gen(550, 22, 2), gen(551, 22, 3)], 'book_title_short')).toBe('Gen. 22:1–3');
  });
  it('formats a whole chapter without verses', () => {
    expect(referenceFromRows([gen(1, 1, 1, 2), gen(2, 1, 2, 2)])).toBe('Genesis 1');
  });
  it('a range from verse 1 into the next chapter starts with the bare chapter, as PHP printed it', () => {
    const rows = [...range(1, 31).map(v => gen(100 + v, 1, v, 31)), gen(132, 2, 1, 25), gen(133, 2, 2, 25)];
    expect(referenceFromRows(rows)).toBe('Genesis 1–2:2');
  });
  it('a one-verse chapter keeps its verse', () => {
    const dc13 = { verse_id: 37991, book_id: 82, chapter: 13, verse: 1, chapter_max: 1, book_title: 'Doctrine and Covenants', book_title_short: 'D&C' };
    expect(referenceFromRows([dc13], 'book_title_short')).toBe('D&C 13:1');
  });
  it('a range across a book end is one range', () => {
    const eph = { verse_id: 29364, book_id: 49, chapter: 6, verse: 24, chapter_max: 24, book_title: 'Ephesians', book_title_short: 'Eph.' };
    const phil = { verse_id: 29365, book_id: 50, chapter: 1, verse: 1, chapter_max: 30, book_title: 'Philippians', book_title_short: 'Philip.' };
    expect(referenceFromRows([eph, phil], 'book_title_short')).toBe('Eph. 6:24–Philip. 1:1');
  });
  it('separate runs in a chapter share the chapter', () => {
    expect(referenceFromRows([gen(5, 1, 5, 31), gen(9, 1, 9, 31)])).toBe('Genesis 1:5,9');
  });
  it('no rows give an empty string', () => expect(referenceFromRows([])).toBe(''));
  it('takes the ids in caller order when given (PHP never sorted them)', () => {
    const rows = [gen(1, 1, 1, 3), gen(2, 1, 0, 3), gen(3, 1, 2, 3), gen(4, 1, 3, 3)];
    expect(referenceFromRows(rows, 'book_title', [1, 3, 4])).toBe('Genesis 1');
    expect(referenceFromRows(rows)).toBe('Genesis 1:1,0,2–3');
  });
});


test('slugifyRef (scriptutil::slufigyRef)', () => {
  expect(slugifyRef('Isa. 1')).toBe('isa.1');
  expect(slugifyRef('D&C 3')).toBe('d&c.3');
  expect(slugifyRef('1 Ne. 3')).toBe('1.ne.3');
  expect(slugifyRef('2 Ne. 12:1')).toBe('2.ne.12.1');
  expect(slugifyRef('1 Jn. 4:9')).toBe('1.jn.4.9');
  expect(slugifyRef('JST John 3:16')).toBe('jst.john.3.16');
  // ranges use a hyphen; no dot after a comma or semicolon
  expect(slugifyRef('Gen. 1:1–5')).toBe('gen.1.1-5');
  expect(slugifyRef('Isaiah 2:1–3')).toBe('isaiah.2.1-3');
  expect(slugifyRef('John 3:16, 18')).toBe('john.3.16,18');
  expect(slugifyRef('')).toBe('');
});

test('versionImg (scriptutil::versionIMG)', () => {
  expect(versionImg('LDS', 1)).toBe('ldskjv');
  expect(versionImg('LDS', 2)).toBe('ldskjv');
  expect(versionImg('LDS', 3)).toBe('lds-bom2');
  expect(versionImg('LDS', 4)).toBe('lds-dc2');
  expect(versionImg('LDS', 5)).toBe('lds-pgp2');
  // a missing volume is 3 (getVolID); other volumes have no LDS cover
  expect(versionImg('LDS', null)).toBe('lds-bom2');
  expect(versionImg('LDS', 8)).toBe('lds');
  // other versions are lowercased without a format suffix
  expect(versionImg('KJV', 1)).toBe('kjv');
  expect(versionImg('KJV*MEV', 1)).toBe('kjv');
});

test('isConsecutive', () => {
  expect(isConsecutive([5])).toBe(true);
  expect(isConsecutive([5, 6, 7])).toBe(true);
  expect(isConsecutive([5, 7])).toBe(false);
});

describe('splitRuns (a passage that skips chapters)', () => {
  const row = (id, chapter, verse) => ({ id, chapter, verse });
  test('verses in chapters that do not follow each other: one part per run, "; " between', () => {
    const rows = [row(31200, 3, 7), row(31201, 3, 8), row(31250, 5, 2), row(31300, 7, 1)];
    expect(splitRuns(rows)).toEqual({ ref: '3:7–8; 5:2; 7:1', slug: '3.7-8;5.2;7.1' });
  });
  test('gaps in one chapter are commas', () => {
    expect(splitRuns([row(1, 3, 16), row(3, 3, 18), row(40, 4, 2)])).toEqual({ ref: '3:16,18; 4:2', slug: '3.16,18;4.2' });
  });
  test('consecutive verses across a chapter end stay one range', () => {
    expect(splitRuns([row(10, 3, 36), row(11, 4, 1), row(12, 4, 2), row(50, 6, 1)])).toEqual({ ref: '3:36–4:2; 6:1', slug: '3.36-4.2;6.1' });
  });
  test('one consecutive run: null (the caller keeps its own format)', () => {
    expect(splitRuns([row(10, 3, 36), row(11, 4, 1)])).toBeNull();
    expect(splitRuns([row(1, 3, 16), row(3, 3, 18)])).toBeNull();
  });
});
