import { describe, test, expect } from 'vitest';
import { chapterRuns } from '../../src/services/ScriptureLookupService.js';

describe('chapterRuns', () => {
  const row = (verse_id, chapter, text = 'And it came to pass.') => ({ verse_id, chapter, text });
  test('one run per chapter, in order', () => {
    const runs = chapterRuns([row(1, 5), row(2, 5), row(3, 6)]);
    expect(runs.map(r => [r.chapter, r.rows.map(x => x.verse_id)])).toEqual([[5, [1, 2]], [6, [3]]]);
  });
  test('a chapter of only "*" lines (compound verses) joins the chapter before it', () => {
    const runs = chapterRuns([row(1, 5), row(2, 6, '*'), row(3, 6, '*'), row(4, 7)]);
    expect(runs.map(r => [r.chapter, r.rows.map(x => x.verse_id)])).toEqual([[5, [1, 2, 3]], [7, [4]]]);
  });
});
