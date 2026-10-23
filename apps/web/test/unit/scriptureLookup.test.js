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
  test('pieces past the limit (the request budget) are not parsed', () => {
    let n = 0;
    const counting = new ScriptureLookupService({ parse: t => { n++; return refs.parse(t); } }, null, null);
    expect(counting.splitBlocks('gen.1.1; 3.1; 4.1; 5.1', 2)).toEqual(['gen.1.1', 'Genesis 3.1', '4.1', '5.1']);
    expect(n).toBe(3);
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

describe('lookup: numbers among words are not verse ids', () => {
  const empty = t => ({ isEmpty: true, book: '', normalized: '', verseIds: [], query: t });
  const ids = t => (/^[\d;,\s-]+$/.test(t) ? { isEmpty: false, book: 'Genesis', normalized: 'Genesis 1:1', verseIds: [Number(t.split(/\D/)[0])], chapter: 1 } : empty(t));
  const refs = { parse: empty, resolve: async t => ids(t) };
  const verses = { findByIds: async () => [], findIndexByIds: async () => [], findChaptersByVerseIds: async () => [] };
  const headings = { findBookId: async () => null, findByVerseIds: async () => [], findFaxVerseIds: async () => [] };
  const svc = new ScriptureLookupService(refs, verses, headings);
  test('PHP read numbers as verse ids only when the whole reference is numeric', async () => {
    const r = await svc.lookup('1999; 12; 31; some-words', {});
    expect(r.reference.verseIds).toEqual([]);
  });
  test('an all-numeric reference still is (PHP is_numeric with ";" and "-" removed)', async () => {
    const r = await svc.lookup('1;5-6', {});
    expect(r.reference.verseIds).toEqual([1, 5]);
  });
});

describe('lookup: chapter nav follows the cleaned reference', () => {
  const rows = [1, 2].map(n => ({ verse_id: 40000 + n, chapter: 2, verse: n, text: 'And it came to pass.' }));
  const refs = { parse: t => ({ isEmpty: false, book: 'Abraham', normalized: 'Abraham 2', verseIds: rows.map(r => r.verse_id), chapter: 2, query: t }) };
  const verses = {
    findByIds: async () => rows.map(r => ({ ...r, version: 'LDS' })),
    findChaptersByVerseIds: async ids => rows.filter(r => ids.includes(r.verse_id)).map(r => ({ verse_id: r.verse_id, chapter: r.chapter })),
  };
  const row = chapter => ({ volume_id: 5, book_title: 'Abraham', book_title_short: 'Abr.', chapter });
  const headings = {
    findBookId: async () => ({ book_id: 1, lds_org: 'abr', book_title: 'Abraham', book_title_short: 'Abr.' }),
    findByVerseIds: async () => [],
    findChapterHeading: async () => null,
    findChapterNavRows: async () => ({ current: row(2), prev: row(1), next: row(3) }),
    findChapterBounds: async () => ({ first: 40001, last: 40002 }),
    hasAudio: async () => 0,
    findParallels: async () => ({}),
    findFaxVerseIds: async () => [],
  };
  const svc = new ScriptureLookupService(refs, verses, headings);
  test('a chapter reference has it', async () => {
    expect((await svc.lookup('abr.2', {})).chapterNav?.next?.href).toBe('/abr.3');
  });
  test('not when cleanReference reads verses into it ("abr.2.1-9.3-4" is "Abraham 2:1-9:3-4"), as PHP checked $meta[0][orig]', async () => {
    expect((await svc.lookup('abr.2.1-9.3-4', {})).chapterNav).toBeNull();
  });
});

describe('lookup: the request budget', async () => {
  const { RequestBudget } = await import('../../src/domain/rules/requestBudget.js');
  const refs = { parse: t => ({ isEmpty: false, book: 'Genesis', normalized: 'Genesis 1:1', verseIds: [1, 2], chapter: 1, query: t }) };
  const verses = {
    findByIds: async ids => ids.map(id => ({ verse_id: id, verse: id, chapter: 1, text: 'In the beginning.', version: 'KJV' })),
    findChaptersByVerseIds: async ids => ids.map(id => ({ verse_id: id, chapter: 1 })),
  };
  const headings = { findBookId: async () => null, findByVerseIds: async () => [], findFaxVerseIds: async () => [] };
  const svc = new ScriptureLookupService(refs, verses, headings);
  test('pieces past the budget are not looked up', async () => {
    const r = await svc.lookup('gen.1.1; gen.1.1; gen.1.1', { version: 'KJV', _budget: new RequestBudget({ pieces: 2 }) });
    expect(r.sections.map(s => s.verses.length)).toEqual([2, 2, 0]);
  });
  test('verses past the budget are not looked up', async () => {
    const r = await svc.lookup('gen.1.1; gen.1.1; gen.1.1', { version: 'KJV', _budget: new RequestBudget({ verses: 5 }) });
    expect(r.sections.map(s => s.verses.length)).toEqual([2, 2, 0]);
  });
  test('without a budget nothing changes', async () => {
    const r = await svc.lookup('gen.1.1; gen.1.1; gen.1.1', { version: 'KJV' });
    expect(r.sections.map(s => s.verses.length)).toEqual([2, 2, 2]);
  });
});

describe('splitBlocks: cost of a long junk reference', async () => {
  const { ReferenceService } = await import('../../src/services/ReferenceService.js');
  test('10,000 pieces with the default budget of 100 parse only the first 100', () => {
    const referenceService = new ReferenceService(null);
    const parse = referenceService.parse.bind(referenceService);
    let calls = 0;
    referenceService.parse = text => { calls++; return parse(text); };
    const svc = new ScriptureLookupService(referenceService, null, null);
    const ref = Array.from({ length: 10000 }, () => 'x1').join(';');
    const t = performance.now();
    const blocks = svc.splitBlocks(ref, 100);
    // A junk piece can be parsed twice (alone, then with the previous book).
    expect(calls).toBeLessThanOrEqual(200);
    // About 0.4 s locally; the bound only catches a return to parsing every piece.
    expect(performance.now() - t).toBeLessThan(5000);
    expect(blocks).toHaveLength(10000);
  });
});

// Psalms 22–24 in one version: each psalm has a heading row at its first verse. A psalm with a
// superscription opens with "§" but not "§¶" (NIV Ps. 23:1 is "§A psalm of David.¶▼The Lord…").
describe('lookup: the passage heading of a verse that starts a section', () => {
  const PS = { 22: [206, 207, 208], 23: [209, 210, 211], 24: [212, 213] };
  const SECTIONS = [[206, 'Psalm 22'], [209, 'Psalm 23'], [212, 'Psalm 24']];
  const chapterOf = id => Number(Object.keys(PS).find(c => PS[c].includes(id)));
  const verseOf = id => PS[chapterOf(id)].indexOf(id) + 1;
  const lastOf = start => { const i = SECTIONS.findIndex(([v]) => v === start); return SECTIONS[i + 1] ? SECTIONS[i + 1][0] - 1 : 213; };

  function service(firstText) {
    const text = id => (id === 209 ? firstText : 'He leadeth me.');
    const refs = { parse: t => {
      const ch = Number(t.match(/^ps\.(\d+)$/)[1]);
      return { isEmpty: false, book: 'Psalms', normalized: `Psalms ${ch}`, verseIds: PS[ch], chapter: ch, query: t };
    } };
    const indexRow = id => ({ verse_id: id, book_id: 19, book_title_short: 'Ps.', chapter: chapterOf(id), verse: verseOf(id) });
    const verses = {
      findByIds: async ids => ids.map(id => ({ verse_id: id, chapter: chapterOf(id), verse: verseOf(id), text: text(id), version: 'NIV' })),
      findChaptersByVerseIds: async ids => ids.map(id => ({ verse_id: id, chapter: chapterOf(id) })),
      findIndexRows: async ids => ids.filter(chapterOf).map(indexRow),
    };
    const navRow = chapter => ({ volume_id: 1, book_title: 'Psalms', book_title_short: 'Ps.', chapter });
    const headings = {
      findBookId: async () => ({ book_id: 19, lds_org: 'ps', book_title: 'Psalms', book_title_short: 'Ps.' }),
      findByVerseIds: async ids => SECTIONS.filter(([v]) => ids.includes(v))
        .map(([verse_id, t]) => ({ verse_id, version: 'NIV', type: 'heading', text: t, last_verse_id: lastOf(verse_id) })),
      // Mirrors HeadingRepository.findChapterHeading: the latest heading at or before the
      // first verse, or before it when the passage does not start a section
      findChapterHeading: async (first, bookId, version, isNewSection) => {
        const at = isNewSection ? first : first - 1;
        const s = SECTIONS.filter(([v]) => v <= at).pop();
        return s ? { verse_id: s[0], version, heading: s[1], last: lastOf(s[0]) } : null;
      },
      findChapterNavRows: async first => ({ current: navRow(chapterOf(first)), prev: navRow(chapterOf(first) - 1), next: navRow(chapterOf(first) + 1) }),
      findChapterBounds: async (bookId, ch) => ({ first: PS[ch][0], last: PS[ch].at(-1) }),
      findBookBounds: async () => ({ first: 206, last: 213 }),
      hasAudio: async () => 0,
      findParallels: async () => ({}),
      findFaxVerseIds: async () => [],
    };
    return new ScriptureLookupService(refs, verses, headings);
  }

  test('a psalm whose superscription starts with "§" is headed by its own psalm (NIV Ps. 23), not the one before', async () => {
    const r = await service('§A psalm of David.¶▼The Lord is my shepherd').lookup('ps.23', { version: 'NIV' });
    expect(r.chapterHeading).toMatchObject({ verse_id: 209, heading: 'Psalm 23', last: 211 });
  });
  test('"§¶" still starts a section (unchanged)', async () => {
    const r = await service('§¶The Lord is my shepherd').lookup('ps.23', { version: 'NIV' });
    expect(r.chapterHeading).toMatchObject({ verse_id: 209, heading: 'Psalm 23' });
  });
  test('a first verse without "§" still takes the heading before it, as PHP did (KJV Ps. 23)', async () => {
    const r = await service('The LORD is my shepherd').lookup('ps.23', { version: 'NIV' });
    expect(r.chapterHeading).toMatchObject({ verse_id: 206, heading: 'Psalm 22' });
  });
  test('a "§" passage that is exactly one section gets section nav, as a "§¶" one does', async () => {
    for (const first of ['§A psalm of David.¶▼The Lord is my shepherd', '§¶The Lord is my shepherd']) {
      const nav = (await service(first).lookup('ps.23', { version: 'NIV' })).chapterNav;
      expect(nav.prev).toMatchObject({ href: '/ps.22', label: 'Psalm 22' });
      expect(nav.next).toMatchObject({ href: '/ps.24', label: 'Psalm 24' });
    }
  });
  test('without "§" the chapter nav stays', async () => {
    const nav = (await service('The LORD is my shepherd').lookup('ps.23', { version: 'NIV' })).chapterNav;
    expect(nav.prev).toMatchObject({ href: '/ps.22', label: 'Psalms 22' });
  });
});
