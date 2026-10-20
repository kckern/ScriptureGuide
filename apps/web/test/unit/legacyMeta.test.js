import { describe, test, expect } from 'vitest';
import { metaFromRef, getBook, defaultVersions } from '../../src/presentation/legacy/meta.js';

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

  test('a later block without a book takes the previous book', () => {
    expect(metaFromRef('gen.1.1;3.1')).toEqual([
      { orig: 'Genesis 1:1', book: 'Genesis', verse_ids: [1] },
      { orig: 'Genesis 3:1', book: 'Genesis', verse_ids: [57] },
    ]);
  });

  test('em dash in a book name becomes a space', () => {
    expect(metaFromRef('js-h.1.17')[0]).toMatchObject({ orig: 'Joseph Smith History 1:17', book: 'Joseph Smith History' });
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
