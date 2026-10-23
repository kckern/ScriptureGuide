import { describe, test, expect } from 'vitest';
import { parseVerseIdList, splitBookReference, bookKey, bookAlias, formatReference, displayReference, blankHeading } from '../../src/domain/rules/referenceParsing.js';

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
  test('book names with numbers in them', () => {
    expect(splitBookReference('jst.1.kgs.7.30')).toEqual({ book: 'jst.1.kgs', chapter: 7, verseStart: 30, verseEnd: 30, chapterEnd: null });
    expect(splitBookReference('1835.doctrine.and.covenants.2:11')).toEqual({ book: '1835.doctrine.and.covenants', chapter: 2, verseStart: 11, verseEnd: 11, chapterEnd: null });
  });
  test('a long adversarial string fails fast', () => {
    const s = 'a'.repeat(8000) + '1'.repeat(8000) + 'x';
    const t0 = performance.now();
    expect(splitBookReference(s)).toBeNull();
    expect(splitBookReference('a.'.repeat(8000) + '1-')).toBeNull();
    expect(performance.now() - t0).toBeLessThan(50);
  });
  test('not a reference', () => {
    expect(splitBookReference('faith')).toBeNull();
    expect(splitBookReference('3')).toBeNull();
  });
});

describe('bookAlias', () => {
  test('cleanReference names for Solomon\'s Song', () => {
    expect(bookAlias('song of solomon')).toBe("solomon's song");
    expect(bookAlias('the song of solomon')).toBe("solomon's song");
    expect(bookAlias('song')).toBe("solomon's song");
    expect(bookAlias('son')).toBe("solomon's song");
    expect(bookAlias('songs')).toBe('songs');
    expect(bookAlias('genesis')).toBe('genesis');
  });
});

describe('bookKey', () => {
  test('normalizes titles, short titles and slugs for matching', () => {
    expect(bookKey('JST Gen.')).toBe('jst gen');
    expect(bookKey('JST 1_sam')).toBe('jst 1 sam');
    expect(bookKey('1 Ne.')).toBe('1 ne');
    expect(bookKey('1ne')).toBe('1 ne');
    expect(bookKey('TSP.')).toBe('tsp');
    expect(bookKey('1835.doctrine.and.covenants')).toBe('1835 doctrine and covenants');
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
  test('a book is not repeated in the next part (referenceFromVerseIds)', () => {
    expect(displayReference('2 Nephi 3:19-20; 2 Nephi 27:13; 2 Nephi 29:2')).toBe('2 Nephi 3:19–20; 27:13; 29:2');
    expect(displayReference('Abraham 2:11; Genesis 17:7; Genesis 18:18')).toBe('Abraham 2:11; Genesis 17:7; 18:18');
    expect(displayReference('1 Nephi 1-5; 1 Nephi 7-19')).toBe('1 Nephi 1–5; 7–19');
    expect(displayReference('Genesis 1; Genesis 3')).toBe('Genesis 1; 3');
    expect(displayReference('Isaiah 9:12; Isaiah 9:17; 2 Nephi 15:25')).toBe('Isaiah 9:12,17; 2 Nephi 15:25');
  });
  test('a range from verse 1 into the next chapter drops the first verse', () => {
    expect(displayReference('2 Nephi 3:1-4:2')).toBe('2 Nephi 3–4:2');
    expect(displayReference('Genesis 1:30-2:3')).toBe('Genesis 1:30–2:3');
  });
  test('except from Genesis 1:1 (verse id 1), where referenceFromVerseIds printed "Genesis 1–2.3"', () => {
    expect(displayReference('Genesis 1:1-2:3')).toBe('Genesis 1–2.3');
    expect(displayReference('Genesis 1:1-3:5')).toBe('Genesis 1–3.5');
    expect(displayReference('Genesis 1:1-5')).toBe('Genesis 1:1–5');
    expect(displayReference('JST Genesis 1:1-2:3')).toBe('JST Genesis 1–2:3');
    // the package lists at most 1000 verses: a capped range was never what PHP titled
    expect(displayReference('Genesis 1:1-34:19', 1000)).toBe('Genesis 1–34:19');
    expect(displayReference('Genesis 1:1-2:3', 34)).toBe('Genesis 1–2.3');
  });
  test('a range across a book end is one range (referenceFromVerseIds)', () => {
    expect(displayReference('Malachi 4:5 - Matthew 1:2')).toBe('Malachi 4:5–Matthew 1:2');
    expect(displayReference('Malachi 4:1 - Matthew 1:2')).toBe('Malachi 4–Matthew 1:2');
    // its cross-book branch printed no "; " before it: live titles "John 3:16Malachi 4:5–Matthew 1:2"
    expect(displayReference('John 3:16; Malachi 4:5 - Matthew 1:2')).toBe('John 3:16Malachi 4:5–Matthew 1:2');
    expect(displayReference('Malachi 4:5 - Matthew 1:2; John 3:16')).toBe('Malachi 4:5–Matthew 1:2; John 3:16');
  });
});

describe('blankHeading', () => {
  test('a reference that matched nothing, cleaned up for display', () => {
    expect(blankHeading('xyz.99')).toBe('Xyz 99');
    expect(blankHeading('john.3.99')).toBe('John 3:99');
  });
  test('a number (PHP is_numeric) is read as verse ids, so one that matched nothing has no heading', () => {
    expect(blankHeading('2.47')).toBe('');
    expect(blankHeading('99999999')).toBe('');
    expect(blankHeading('1-2;5')).toBe('');
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
