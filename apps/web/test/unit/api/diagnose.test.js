import { describe, test, expect } from 'vitest';
import { diagnoseMiss } from '../../../src/api/v1/diagnose.js';

// Jonah: book 32, 4 chapters, chapter 3 has 10 verses
const repo = {
  indexRows: async () => [{ verse_id: 22533, book_id: 32, chapter: 1, verse: 1, book_title: 'Jonah' }],
  chapterCount: async () => 4,
  verseCount: async (_book, chapter) => (chapter === 3 ? 10 : 17),
};

describe('diagnoseMiss', () => {
  test('verse out of range', async () => {
    const e = await diagnoseMiss('jon3.16', repo);
    expect(e).toMatchObject({ code: 'verse_out_of_range', message: 'Jonah 3 has 10 verses.', suggestion: 'Jonah 3:10' });
  });
  test('chapter out of range', async () => {
    const e = await diagnoseMiss('jonah 9', repo);
    expect(e).toMatchObject({ code: 'chapter_out_of_range', suggestion: 'Jonah 4' });
  });
  test('unknown book', async () => {
    expect((await diagnoseMiss('xyz9.9', repo)).code).toBe('unknown_book');
  });
  test('no letters or no digits', async () => {
    expect((await diagnoseMiss('loved the world', repo)).code).toBe('unparseable_reference');
  });
});
