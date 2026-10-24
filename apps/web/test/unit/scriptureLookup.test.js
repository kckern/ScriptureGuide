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
  test('a cross-book range does not change the running book (loadMetaFromRef skipped getBook)', () => {
    const books = { 'john.3.16': ['John', 'John 3:16'], 'mal.4.5-matt.1.2': ['Malachi', 'Malachi 4:5 - Matthew 1:2'], 'John 3': ['John', 'John 3'], 'Malachi 3': ['Malachi', 'Malachi 3'] };
    const parse = t => (books[t] ? { isEmpty: false, book: books[t][0], normalized: books[t][1] } : { isEmpty: true, book: '' });
    expect(new ScriptureLookupService({ parse }, null, null).splitBlocks('john.3.16;mal.4.5-matt.1.2;3')).toEqual(['john.3.16', 'mal.4.5-matt.1.2', 'John 3']);
  });
  test('a JST piece keeps its own book: the package does not read JST books, the lookup does', () => {
    const parse = t => (t === 'john.3.16' ? { isEmpty: false, book: 'John', normalized: 'John 3:16' } : { isEmpty: true, book: '' });
    expect(new ScriptureLookupService({ parse }, null, null).splitBlocks('john.3.16;jst.john.3.16')).toEqual(['john.3.16', 'jst.john.3.16']);
    expect(new ScriptureLookupService({ parse }, null, null).splitBlocks('john.3.16; JST John 3:18')).toEqual(['john.3.16', 'JST John 3:18']);
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
  const NO_ROW_AT_23 = SECTIONS.filter(([v]) => v !== 209);
  const chapterOf = id => Number(Object.keys(PS).find(c => PS[c].includes(id)));
  const verseOf = id => PS[chapterOf(id)].indexOf(id) + 1;

  function service(firstText, sections = SECTIONS) {
    const lastOf = start => { const i = sections.findIndex(([v]) => v === start); return sections[i + 1] ? sections[i + 1][0] - 1 : 213; };
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
      findByVerseIds: async ids => sections.filter(([v]) => ids.includes(v))
        .map(([verse_id, t]) => ({ verse_id, version: 'NIV', type: 'heading', text: t, last_verse_id: lastOf(verse_id) })),
      // Mirrors HeadingRepository.findChapterHeading: the latest heading at or before the
      // first verse, or before it when the passage does not start a section
      findChapterHeading: async (first, bookId, version, isNewSection) => {
        const at = isNewSection ? first : first - 1;
        const s = sections.filter(([v]) => v <= at).pop();
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
  // NET Ps. 90:1 "Book 4 (Psalms 90-106)§A prayer of Moses…": a division label before the §
  test('a "§" after a leading label starts a section when the verse has a heading row (NET Ps. 90)', async () => {
    const r = await service('Book 4 (Psalms 90-106)§A prayer of Moses.¶▼Lord, you have been our refuge').lookup('ps.23', { version: 'NIV' });
    expect(r.chapterHeading).toMatchObject({ verse_id: 209, heading: 'Psalm 23' });
    expect(r.chapterNav.prev).toMatchObject({ label: 'Psalm 22' });
  });
  test('not without a heading row at the verse', async () => {
    const r = await service('Book 4 (Psalms 90-106)§A prayer of Moses.¶▼Lord', NO_ROW_AT_23).lookup('ps.23', { version: 'NIV' });
    expect(r.chapterHeading).toMatchObject({ verse_id: 206, heading: 'Psalm 22' });
  });
  test('a verse that ends the section before and starts one with "§¶" keeps the heading before it', async () => {
    const r = await service('Then Nathan went home.§¶The Lord struck the child').lookup('ps.23', { version: 'NIV' });
    expect(r.chapterHeading).toMatchObject({ verse_id: 206, heading: 'Psalm 22' });
  });
});

describe('lookup: a range from verse 1 into the next chapter (LDS, no section headings)', async () => {
  const { default: HtmlPresenter } = await import('../../src/presentation/presenters/HtmlPresenter.js');
  // 1 Nephi 1 is ids 101–103, 1 Nephi 2 is 104–106; each chapter opens with "§"
  const CH = { 1: [101, 102, 103], 2: [104, 105, 106] };
  const chapterOf = id => (id <= 103 ? 1 : 2);
  const verseOf = id => CH[chapterOf(id)].indexOf(id) + 1;
  function service(ids, normalized) {
    const refs = { parse: () => ({ isEmpty: false, book: '1 Nephi', normalized, verseIds: ids, chapter: 1 }) };
    const verses = {
      findByIds: async list => list.map(id => ({ verse_id: id, chapter: chapterOf(id), verse: verseOf(id), text: verseOf(id) === 1 ? '§¶And it came to pass.' : 'And it came to pass.', version: 'LDS' })),
      findChaptersByVerseIds: async list => list.map(id => ({ verse_id: id, chapter: chapterOf(id) })),
    };
    const headings = {
      findBookId: async () => ({ book_id: 66, lds_org: '1-ne', book_title: '1 Nephi', book_title_short: '1 Ne.' }),
      findByVerseIds: async () => [],
      findChapterHeading: async () => null,
      findChapterNavRows: async () => null,
      findChapterBounds: async (bookId, ch) => ({ first: CH[ch][0], last: CH[ch].at(-1) }),
      findBookBounds: async () => ({ first: 101, last: 106 }),
      hasAudio: async () => 0,
      findParallels: async () => ({}),
      findFaxVerseIds: async () => [],
    };
    return new ScriptureLookupService(refs, verses, headings);
  }
  const refs = async (ids, normalized) => {
    const data = new HtmlPresenter().serialize(await service(ids, normalized).lookup('x', { version: 'LDS' }));
    return Object.values(data.h3ByVerse).map(h => [h.ref, h.slug]);
  };
  test('the whole first chapter is headed by the chapter, as referenceFromVerseIds named it', async () => {
    expect(await refs([101, 102, 103, 104, 105], '1 Nephi 1:1-2:2')).toEqual([['1 Nephi 1', 'LDS/1.nephi.1'], ['1 Nephi 2:1–2', 'LDS/1.nephi.2.1-2']]);
  });
  test('a part of the first chapter keeps its verses', async () => {
    expect((await refs([102, 103, 104, 105], '1 Nephi 1:2-2:2'))[0]).toEqual(['1 Nephi 1:2–3', 'LDS/1.nephi.1.2-3']);
  });
});

describe('lookup: a range across a book end', async () => {
  const { default: HtmlPresenter } = await import('../../src/presentation/presenters/HtmlPresenter.js');
  // Malachi 4 is ids 201–203 (book 39), Matthew 1 is 204–206 (book 40); Matthew 1:1 opens with "§"
  const BOOKS = { 39: { book_id: 39, lds_org: 'mal', book_title: 'Malachi', book_title_short: 'Mal.' }, 40: { book_id: 40, lds_org: 'matt', book_title: 'Matthew', book_title_short: 'Matt.' } };
  const bookOf = id => (id <= 203 ? 39 : 40);
  const chapterOf = id => (id <= 203 ? 4 : 1);
  const verseOf = id => (id <= 203 ? id - 200 : id - 203);
  const ids = [202, 203, 204, 205];
  let ranges, bookQueries = 0;
  const refs = { parse: () => ({ isEmpty: false, book: 'Malachi', normalized: 'Malachi 4:2 - Matthew 1:2', verseIds: ids, chapter: 4 }) };
  const verses = {
    findByIds: async list => list.map(id => ({ verse_id: id, book_id: bookOf(id), chapter: chapterOf(id), verse: verseOf(id), text: id === 204 ? '§¶The book.' : 'And it came to pass.', version: 'LDS' })),
    findChaptersByVerseIds: async list => list.map(id => ({ verse_id: id, book_id: bookOf(id), chapter: chapterOf(id) })),
  };
  const headings = {
    findBookId: async id => BOOKS[bookOf(id)],
    findBooks: async list => { bookQueries++; return list.map(b => BOOKS[b]); },
    findByVerseIds: async () => [],
    findChapterHeading: async () => null,
    findChapterNavRows: async () => null,
    findChapterBounds: async (bookId, ch) => (bookId === 39 && ch === 4 ? { first: 201, last: 203 } : bookId === 40 && ch === 1 ? { first: 204, last: 206 } : { first: 1, last: 9 }),
    findBookBounds: async () => ({ first: 201, last: 206 }),
    hasAudio: async () => 0,
    findParallels: async r => { ranges = r; return {}; },
    findFaxVerseIds: async () => [],
  };
  const data = async () => new HtmlPresenter().serialize(await new ScriptureLookupService(refs, verses, headings).lookup('x', { version: 'LDS' }));
  test('the second book\'s section is headed and slugged by that book, over its own chapter', async () => {
    const h3 = Object.values((await data()).h3ByVerse);
    expect(h3.map(h => [h.ref, h.slug])).toEqual([['Malachi 4:2–3', 'LDS/malachi.4.2-3'], ['Matthew 1:1–2', 'LDS/matthew.1.1-2']]);
    expect(h3[1].displayVerseId ?? h3[1].verse_id).toBe(204);
  });
  test('its parallels are looked up under its own book (live: "JST*lds/matt.1.1-2~…")', async () => {
    await data();
    expect(ranges.map(r => [r.from, r.bookSlug])).toEqual([[202, 'mal'], [204, 'matt']]);
    expect(ranges.every(r => !r.dstSlugOverride || r.dstSlugOverride.startsWith(r.bookSlug + '.'))).toBe(true);
  });
  test('the other books are read in one query', async () => {
    bookQueries = 0;
    await data();
    expect(bookQueries).toBe(1);
  });
  test('its verses carry their own book', async () => {
    const d = await data();
    expect(d.verses.map(v => v.book ?? d.book)).toEqual(['Malachi', 'Malachi', 'Matthew', 'Matthew']);
  });
});

describe('lookup for meta', async () => {
  // meta lists reference blocks only (MetaPresenter): no verse text, headings or navigation
  const { Reference } = await import('../../src/domain/entities/Reference.js');
  const refs = { parse: () => new Reference({ query: 'john.3.16', normalized: 'John 3:16', verseIds: [26137], _book: 'John' }) };
  const untouched = new Proxy({}, { get: (_, name) => () => { throw new Error(`repository read: ${String(name)}`); } });
  test('resolves the reference without reading verses or headings', async () => {
    const r = await new ScriptureLookupService(refs, untouched, untouched).lookup('john.3.16', { outputFormat: 'meta' });
    expect(r.reference.verseIds).toEqual([26137]);
    expect(r.reference.book).toBe('John');
  });
});
