import { describe, test, expect } from 'vitest';
import { slugifyRef, wantsChapterNav, chapterNavLinks } from '../../src/domain/rules/chapterNav.js';

describe('slugifyRef', () => {
  test('lowercases and joins with dots like scriptutil::slufigyRef', () => {
    expect(slugifyRef('Isa. 1')).toBe('isa.1');
    expect(slugifyRef('D&C 3')).toBe('d&c.3');
    expect(slugifyRef('1 Ne. 3')).toBe('1.ne.3');
    expect(slugifyRef('Gen. 1:1–5')).toBe('gen.1.1-5');
    expect(slugifyRef('John 3:16, 18')).toBe('john.3.16,18');
  });
});

describe('wantsChapterNav', () => {
  test('only for a single block without verse numbers', () => {
    expect(wantsChapterNav('Isaiah 2')).toBe(true);
    expect(wantsChapterNav('Genesis 1-2')).toBe(true);
    expect(wantsChapterNav('John 3:16')).toBe(false);
    expect(wantsChapterNav('John 3; Genesis 1')).toBe(false);
    expect(wantsChapterNav('')).toBe(false);
  });
});

describe('chapterNavLinks', () => {
  const row = (volume_id, book_title, book_title_short, chapter) => ({ volume_id, book_title, book_title_short, chapter });
  const isa2 = row(1, 'Isaiah', 'Isa.', 2);

  test('prev and next chapter, labelled with the full book name', () => {
    expect(chapterNavLinks({ current: isa2, prev: row(1, 'Isaiah', 'Isa.', 1), next: row(1, 'Isaiah', 'Isa.', 3) })).toEqual({
      prev: { href: '/isa.1', label: 'Isaiah 1' },
      next: { href: '/isa.3', label: 'Isaiah 3' },
    });
  });
  test('links keep the version segment as typed', () => {
    const nav = chapterNavLinks({ current: isa2, prev: row(1, 'Isaiah', 'Isa.', 1), next: null, versionSpec: 'nrsv' });
    expect(nav).toEqual({ prev: { href: '/nrsv/isa.1', label: 'Isaiah 1' }, next: null });
  });
  test('no link across a volume boundary', () => {
    const mal4 = row(1, 'Malachi', 'Mal.', 4);
    expect(chapterNavLinks({ current: mal4, prev: row(1, 'Malachi', 'Mal.', 3), next: row(2, 'Matthew', 'Matt.', 1) }).next).toBeNull();
  });
});
