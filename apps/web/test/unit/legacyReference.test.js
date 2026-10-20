import { describe, it, expect } from 'vitest';
import { formatReference, chapterRef } from '../../src/domain/rules/legacyReference.js';

const gen = (verse_id, chapter, verse, chapter_max = 24) =>
  ({ verse_id, book_id: 1, chapter, verse, chapter_max, book_title: 'Genesis', book_title_short: 'Gen.' });

describe('formatReference', () => {
  it('formats a single verse and a range with an en dash', () => {
    expect(formatReference([gen(549, 22, 1)], 'book_title_short')).toBe('Gen. 22:1');
    expect(formatReference([gen(549, 22, 1), gen(550, 22, 2), gen(551, 22, 3)], 'book_title_short')).toBe('Gen. 22:1–3');
  });
  it('formats a whole chapter without verses', () => {
    expect(formatReference([gen(1, 1, 1, 2), gen(2, 1, 2, 2)])).toBe('Genesis 1');
  });
  it('formats ranges across chapters and separate runs', () => {
    expect(formatReference([gen(31, 1, 31, 31), gen(32, 2, 1, 25)])).toBe('Genesis 1:31–2:1');
    expect(formatReference([gen(5, 1, 5, 31), gen(9, 1, 9, 31)])).toBe('Genesis 1:5; Genesis 1:9');
  });
});

describe('chapterRef', () => {
  it('uses the short book title', () => {
    expect(chapterRef(gen(549, 22, 1))).toBe('Gen. 22');
  });
});
