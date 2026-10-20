import { describe, test, expect } from 'vitest';
import { parseVerseIdList, splitBookReference, bookKey, formatReference, displayReference, blankHeading } from '../../src/domain/rules/referenceParsing.js';

describe('parseVerseIdList', () => {
  test('numeric references are verse ids', () => {
    expect(parseVerseIdList('26137')).toEqual([26137]);
    expect(parseVerseIdList('1-3')).toEqual([1, 2, 3]);
    expect(parseVerseIdList('1;5-6')).toEqual([1, 5, 6]);
    expect(parseVerseIdList('john 3')).toBeNull();
    expect(parseVerseIdList('')).toBeNull();
  });
});

describe('splitBookReference', () => {
  test('book, chapter and verses', () => {
    expect(splitBookReference('jst john.3.16')).toEqual({ book: 'jst john', chapter: 3, verseStart: 16, verseEnd: 16, chapterEnd: null });
    expect(splitBookReference('tsp.1.1-5')).toEqual({ book: 'tsp', chapter: 1, verseStart: 1, verseEnd: 5, chapterEnd: null });
    expect(splitBookReference('Lectures on Faith 3:6')).toEqual({ book: 'lectures on faith', chapter: 3, verseStart: 6, verseEnd: 6, chapterEnd: null });
    expect(splitBookReference('1ne 2')).toEqual({ book: '1ne', chapter: 2, verseStart: null, verseEnd: null, chapterEnd: null });
    expect(splitBookReference('jst gen 1-2')).toEqual({ book: 'jst gen', chapter: 1, verseStart: null, verseEnd: null, chapterEnd: 2 });
  });
  test('not a reference', () => {
    expect(splitBookReference('faith')).toBeNull();
    expect(splitBookReference('3')).toBeNull();
  });
});

describe('bookKey', () => {
  test('normalizes titles, short titles and slugs for matching', () => {
    expect(bookKey('JST Gen.')).toBe('jst gen');
    expect(bookKey('JST 1_sam')).toBe('jst 1 sam');
    expect(bookKey('1 Ne.')).toBe('1 ne');
    expect(bookKey('1ne')).toBe('1 ne');
    expect(bookKey('TSP.')).toBe('tsp');
  });
});

describe('displayReference', () => {
  test('en dashes in ranges', () => {
    expect(displayReference('Genesis 1:1-5')).toBe('Genesis 1:1–5');
    expect(displayReference('Genesis 1:30-2:3')).toBe('Genesis 1:30–2:3');
  });
  test('verses of the same chapter are joined with commas', () => {
    expect(displayReference('John 3:16; 3:18')).toBe('John 3:16,18');
    expect(displayReference('John 3:16-17; 3:20; 4:1')).toBe('John 3:16–17,20; 4:1');
  });
  test('separate books stay separate', () => {
    expect(displayReference('John 3:16; Genesis 1:1')).toBe('John 3:16; Genesis 1:1');
  });
});

describe('blankHeading', () => {
  test('a reference that matched nothing, cleaned up for display', () => {
    expect(blankHeading('xyz.99')).toBe('Xyz 99');
    expect(blankHeading('john.3.99')).toBe('John 3:99');
  });
});

describe('formatReference', () => {
  test('book, chapter and verse ranges', () => {
    expect(formatReference('JST John', [{ chapter: 3, verse: 16 }], false)).toBe('JST John 3:16');
    expect(formatReference('Lectures on Faith', [{ chapter: 1, verse: 1 }, { chapter: 1, verse: 2 }], false)).toBe('Lectures on Faith 1:1-2');
    expect(formatReference('JST Genesis', [{ chapter: 1, verse: 1 }, { chapter: 1, verse: 2 }], true)).toBe('JST Genesis 1');
    expect(formatReference('JST Genesis', [{ chapter: 1, verse: 30 }, { chapter: 2, verse: 1 }], false)).toBe('JST Genesis 1:30-2:1');
  });
});
