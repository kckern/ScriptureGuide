import { describe, test, expect } from 'vitest';
import { formatReference, slugifyRef, versionImg, isConsecutive } from '../../src/services/legacyReference.js';

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
  test('two books', () => expect(ref([1, 1015])).toBe('Genesis 1:1; John 3:16'));
  test('short book titles', () => {
    const s = fixture('short');
    expect(formatReference([1, 2], s.info, s.chapterMax)).toBe('Gen. 1:1–2');
  });
  test('unknown ids give an empty string', () => expect(ref([99999])).toBe(''));
});

describe('helpers', () => {
  test('slugifyRef', () => {
    expect(slugifyRef('2 Ne. 12:1')).toBe('2.ne.12.1');
    expect(slugifyRef('Isaiah 2:1–3')).toBe('isaiah.2.1-3');
    expect(slugifyRef('D&C 4:5')).toBe('d&c.4.5');
  });
  test('versionImg picks LDS covers by volume', () => {
    expect(versionImg('LDS', 1)).toBe('ldskjv');
    expect(versionImg('LDS', 3)).toBe('lds-bom2');
    expect(versionImg('LDS', 4)).toBe('lds-dc2');
    expect(versionImg('KJV', 1)).toBe('kjv');
    expect(versionImg('KJV*MEV', 1)).toBe('kjv');
  });
  test('isConsecutive', () => {
    expect(isConsecutive([5])).toBe(true);
    expect(isConsecutive([5, 6, 7])).toBe(true);
    expect(isConsecutive([5, 7])).toBe(false);
  });
});
