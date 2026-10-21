import { describe, test, expect } from 'vitest';
import { chapterRuns, ScriptureLookupService } from '../../src/services/ScriptureLookupService.js';

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

describe('splitBlocks', () => {
  // parse knows "gen.1.1" only
  const refs = { parse: t => (t === 'gen.1.1' ? { isEmpty: false, book: 'Genesis' } : { isEmpty: true, book: '' }) };
  const svc = new ScriptureLookupService(refs, null, null);
  test('a block without a book takes the previous block\'s book', () => {
    expect(svc.splitBlocks('gen.1.1; 3.1')).toEqual(['gen.1.1', 'Genesis 3.1']);
  });
  test('a number after an unknown word stays with that word, not a verse id (scriptutil::getBook)', () => {
    expect(svc.splitBlocks('corianton; 38')).toEqual(['corianton', 'corianton 38']);
    expect(svc.splitBlocks('zoramites; almas-teachings; 5')).toEqual(['zoramites', 'almas-teachings', 'almas-teachings 5']);
  });
  test('an all-numeric reference stays verse ids', () => {
    expect(svc.splitBlocks('1; 5-6')).toEqual(['1', '5-6']);
  });
});

describe('lookup: the short book title for compound refs', () => {
  const rows = { 1: { verse_id: 1, verse: 1, chapter: 1, text: 'In the beginning.' }, 57: { verse_id: 57, verse: 1, chapter: 3, text: '*' } };
  const refs = { parse: t => ({ isEmpty: false, book: 'Genesis', normalized: t, verseIds: t.includes('3') ? [57] : [1], chapter: 1 }) };
  const verses = {
    findByIds: async ids => ids.map(id => ({ ...rows[id], version: 'KJV' })),
    findChaptersByVerseIds: async ids => ids.map(id => ({ verse_id: id, chapter: rows[id].chapter })),
  };
  const headings = {
    findBookId: async () => ({ book_id: 1, lds_org: 'gen', book_title: 'Genesis', book_title_short: 'Gen.' }),
    findFaxVerseIds: async () => [],
  };
  const svc = new ScriptureLookupService(refs, verses, headings);
  test('is set on every block, with or without headings', async () => {
    const r = await svc.lookup('gen.1.1; gen.3.1', { version: 'KJV', includeHeadings: false });
    expect(r.sections.map(s => s.config._bookShort)).toEqual(['Gen.', 'Gen.']);
  });
});

describe('lookup: the parallel slug of a passage that skips chapters', () => {
  const rows = [[31200, 3, 7], [31201, 3, 8], [31250, 5, 2], [31300, 7, 1]]
    .map(([verse_id, chapter, verse]) => ({ verse_id, chapter, verse, text: 'And it came to pass.' }));
  const normalized = '1 Nephi 3:7-8; 5:2; 7:1';
  const refs = { parse: () => ({ isEmpty: false, book: '1 Nephi', normalized, verseIds: rows.map(r => r.verse_id), chapter: 3 }) };
  const verses = {
    findByIds: async () => rows.map(r => ({ ...r, version: 'LDS' })),
    findChaptersByVerseIds: async ids => rows.filter(r => ids.includes(r.verse_id)).map(r => ({ verse_id: r.verse_id, chapter: r.chapter })),
  };
  let ranges;
  const headings = {
    findBookId: async () => ({ book_id: 66, lds_org: '1-ne', book_title: '1 Nephi', book_title_short: '1 Ne.' }),
    findByVerseIds: async () => [],
    findChapterHeading: async () => null,
    findChapterBounds: async () => ({ first: 31194, last: 31224 }),
    hasAudio: async () => 1,
    findParallels: async r => { ranges = r; return {}; },
    findFaxVerseIds: async () => [],
  };
  test('names each run ("1.ne.3.7-8;5.2;7.1")', async () => {
    await new ScriptureLookupService(refs, verses, headings).lookup('1.nephi.3:7–8,.5:2,.7:1', { version: 'LDS' });
    expect(ranges[0].dstSlugOverride).toBe('1.ne.3.7-8;5.2;7.1');
  });
});
