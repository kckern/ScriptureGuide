import { describe, test, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../../src/data/db/connection.js', () => ({ default: { query: (...a) => query(...a) } }));
const { default: headingRepository } = await import('../../src/data/repositories/HeadingRepository.js');

beforeEach(() => query.mockReset());

// scriptutil::loadHeading: a section runs to the version's next heading in any book, and the
// version's last heading runs to its last verse.
describe('heading ranges (scriptutil::loadHeading)', () => {
  test('the next heading is looked up across books', async () => {
    query.mockResolvedValueOnce([{ verse_id: 10, type: 'heading', text: 'A', last_verse_id: 19 }]);
    await headingRepository.findByVerseIds([10], 'KJV');
    expect(query.mock.calls[0][0]).not.toMatch(/h2\.book_id/);
  });
  test('the last heading of a version runs to its last verse', async () => {
    query
      .mockResolvedValueOnce([{ verse_id: 10, type: 'heading', text: 'A', last_verse_id: null }])
      .mockResolvedValueOnce([{ last: 42 }]);
    const rows = await headingRepository.findByVerseIds([10], 'KJV');
    expect(rows[0].last_verse_id).toBe(42);
  });
  test('the chapter heading ends before the next heading in any book', async () => {
    query
      .mockResolvedValueOnce([{ verse_id: 10, version: 'KJV', type: 'heading', text: 'A' }])
      .mockResolvedValueOnce([{ verse_id: 30 }]);
    const h = await headingRepository.findChapterHeading(10, 1, 'KJV', true);
    expect(h.last).toBe(29);
    expect(query.mock.calls[1][0]).not.toMatch(/book_id/);
  });
});
