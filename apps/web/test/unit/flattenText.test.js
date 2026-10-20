import { describe, test, expect } from 'vitest';
import { flattenText, splitVerseLines, plainPassage } from '../../src/presentation/legacy/flattenText.js';

describe('flattenText (scriptutil::flattenText)', () => {
  test('drops section and paragraph markers and smallcaps brackets', () => {
    expect(flattenText('§¶｟In｠ the beginning God created the heaven and the earth.'))
      .toBe('In the beginning God created the heaven and the earth.');
  });

  test('drops footnote markers and tags', () => {
    expect(flattenText('the <i>Word</i>｢12｣ was God')).toBe('the Word was God');
  });

  test('turns line and verse separators into spaces', () => {
    expect(flattenText('The Lord is my shepherd;/I shall not want.')).toBe('The Lord is my shepherd; I shall not want.');
    expect(flattenText('a || b')).toBe('a b');
  });

  test('removes underscores and struck-out text', () => {
    expect(flattenText('_indented ~~gone~~text')).toBe('indented text');
  });

  test('adds a space after punctuation run together between letters', () => {
    expect(flattenText('first,second.third')).toBe('first, second. third');
  });

  test('keeps Korean and drops digits that follow Korean letters', () => {
    expect(flattenText('안녕하세요1 세계')).toBe('안녕하세요 세계');
  });

  test('keeps typographic quotes and dashes', () => {
    expect(flattenText('the Lord’s house—“yea”')).toBe('the Lord’s house—“yea”');
  });
});

describe('splitVerseLines', () => {
  test('splits on paragraph meta and line breaks, skipping empties', () => {
    expect(splitVerseLines('§¶A Psalm of David.¶▼The Lord is my shepherd,/I shall not want.'))
      .toEqual(['A Psalm of David.', 'The Lord is my shepherd,', 'I shall not want.']);
  });
});

describe('plainPassage (renderText for one passage)', () => {
  test('joins verse lines with single spaces and keeps a trailing space', () => {
    const verses = [
      { text: '§¶｟In｠ the beginning God created the heaven and the earth.' },
      { text: 'And the earth was without form, and void.' },
    ];
    expect(plainPassage(verses)).toBe('In the beginning God created the heaven and the earth. And the earth was without form, and void. ');
  });

  test('skips gap verses marked with an asterisk', () => {
    expect(plainPassage([{ text: 'a' }, { text: '*' }, { text: 'b' }])).toBe('a b ');
  });
});
