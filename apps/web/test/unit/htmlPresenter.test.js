import { describe, test, expect } from 'vitest';
import ejs from 'ejs';
import { fileURLToPath } from 'node:url';
import { HtmlPresenter } from '../../src/presentation/presenters/HtmlPresenter.js';
import { Verse } from '../../src/domain/entities/Verse.js';
import { Reference } from '../../src/domain/entities/Reference.js';
import { ScriptureResult } from '../../src/domain/entities/ScriptureResult.js';

// Genesis 29:31–30:3 as verse ids 1..8 (synthetic text)
function crossChapter(normalized, firstVerse) {
  const rows = [];
  let id = 1;
  for (let v = firstVerse; v <= 35; v++) rows.push({ id: id++, chapter: 29, verseNum: v });
  for (let v = 1; v <= 3; v++) rows.push({ id: id++, chapter: 30, verseNum: v });
  const verses = rows.map(r => new Verse({ ...r, text: 'In the beginning.', version: 'KJV' }));
  const vChapterMap = Object.fromEntries(rows.map(r => [r.id, r.chapter]));
  return new ScriptureResult({
    reference: new Reference({ query: normalized, normalized, verseIds: rows.map(r => r.id) }),
    verses,
    headings: [{ verse_id: 1, type: 'heading', text: 'A section', last_verse_id: rows.length, book_id: 1 }],
    config: { version: 'KJV', _vChapterMap: vChapterMap, _bookTitle: 'Genesis' },
  });
}

describe('HtmlPresenter heading ref', () => {
  test('a section crossing a chapter names the end verse with a colon', () => {
    const data = new HtmlPresenter().serialize(crossChapter('Genesis 29:31-30:3', 31));
    const refs = JSON.stringify(data).match(/"ref":"Genesis [^"]*"/g);
    expect(refs).toContain('"ref":"Genesis 29:31–30:3"');
  });

  test('heading text renders subscripts and line breaks (renderHeadingHTML)', () => {
    const result = crossChapter('Genesis 29:31-30:3', 31);
    result.headings[0].text = 'Lehi\u2081/Sariah';
    const data = new HtmlPresenter().serialize(result);
    expect(data.h3ByVerse[1].textHtml).toBe('Lehi<sub>1</sub><br/>Sariah');
    expect(data.h3ByVerse[1].text).toBe('Lehi\u2081/Sariah');
  });

  test('a "*" verse folds into the verse before it (compound verses)', () => {
    const texts = ['¶And it came to pass.', '*', '*', '¶And again.'];
    const verses = texts.map((text, i) => new Verse({ id: 10 + i, verseNum: i + 1, chapter: 2, text, version: '2HRBOM' }));
    const result = new ScriptureResult({
      reference: new Reference({ query: '1 Nephi 2:1-4', normalized: '1 Nephi 2:1-4', verseIds: [10, 11, 12, 13] }),
      verses,
      headings: [],
      config: { version: '2HRBOM', _bookTitle: '1 Nephi', _bookShort: '1 Ne.' },
    });
    const data = new HtmlPresenter().serialize(result);
    expect(data.verses.map(v => v.id)).toEqual([10, 13]);
    expect(data.verses[0]).toMatchObject({ compound: 3, compoundRef: '1 Ne. 2:1–3', compoundLabel: '1–3', gapIds: [11, 12] });
    expect(data.verses[1].compound).toBeUndefined();
  });

  test('a subheading follows the heading on a new line, in <small>', () => {
    const result = crossChapter('Genesis 29:31-30:3', 31);
    result.headings.push({ verse_id: 1, type: 'subheading', text: 'al-Dukh\u0101n' });
    const data = new HtmlPresenter().serialize(result);
    expect(data.h3ByVerse[1].textHtml).toBe('A section<br/><small>al-Dukh\u0101n</small>');
  });
});

describe('HtmlPresenter: sections from the PHP blocks of a reference that found nothing', () => {
  const section = block => {
    const r = new ScriptureResult({ reference: new Reference({ query: block.orig, normalized: '', verseIds: [] }), verses: [], config: {} });
    r.legacyBlock = block;
    return new HtmlPresenter().serialize(r);
  };
  test('a block without verses is headed with its cleaned text, escaped', () => {
    expect(section({ orig: '1 Corianton 12', book: '1 Corianton', verse_ids: [] }).blank).toBe('1 Corianton 12');
    expect(section({ orig: ' 30', book: '', verse_ids: false }).blank).toBe(' 30');
    expect(section({ orig: '<B>', book: '<B>', verse_ids: [] }).blank).toBe('&lt;B&gt;');
  });
  test('a multi-book range whose ends matched nothing is an empty section', () => {
    const data = section({ orig: 'Farewell-speech', book: 'Multi', verse_ids: [null] });
    expect(data.emptySection).toBe(true);
  });
});

describe('HtmlPresenter: a passage that skips chapters', () => {
  test('the heading names each run, not one range from the first chapter to the last', () => {
    const rows = [[31200, 3, 7], [31201, 3, 8], [31250, 5, 2], [31300, 7, 1]];
    const verses = rows.map(([id, chapter, verseNum]) => new Verse({ id, chapter, verseNum, text: 'And it came to pass.', version: 'LDS' }));
    const normalized = '1 Nephi 3:7-8; 5:2; 7:1';
    const result = new ScriptureResult({
      reference: new Reference({ query: normalized, normalized, verseIds: rows.map(r => r[0]) }),
      verses,
      headings: [{ verse_id: 31200, type: 'heading', text: '', last_verse_id: 31300, synthetic: true, book_id: 1 }],
      config: { version: 'LDS', _vChapterMap: Object.fromEntries(rows.map(r => [r[0], r[1]])), _bookTitle: '1 Nephi' },
    });
    const h = new HtmlPresenter().serialize(result).h3ByVerse[31200];
    expect(h.ref).toBe('1 Nephi 3:7–8; 5:2; 7:1');
    expect(h.slug).toBe('LDS/1.nephi.3.7-8;5.2;7.1');
  });
});

describe('HtmlPresenter: audio without a chapter heading', () => {
  test('a passage with audio but no chapter heading row still marks its h3 (The Book of Lehi, TSP)', () => {
    const verses = [1, 2].map(n => new Verse({ id: 82291 + n, verseNum: n, chapter: 1, text: '¶And it came to pass.', version: 'TSP' }));
    const result = new ScriptureResult({
      reference: new Reference({ query: 'The Book of Lehi 1', normalized: 'The Book of Lehi 1', verseIds: [82292, 82293] }),
      verses,
      headings: [{ verse_id: 82292, type: 'heading', text: '', last_verse_id: 82293, synthetic: true, _wholeChapter: true, _chapterNum: 1 }],
      config: { version: 'TSP', _bookTitle: 'The Book of Lehi', _audio: 1 },
    });
    expect(new HtmlPresenter().serialize(result).h3ByVerse[82292].audio).toBe(1);
  });
});

describe('HtmlPresenter: link-preview description (og:description)', () => {
  const summary = 'Sariah complains against Lehi—Both rejoice over the return of their sons.';
  const page = subChapter => new ScriptureResult({
    reference: new Reference({ query: '1 Nephi 5:3', normalized: '1 Nephi 5:3', verseIds: [3] }),
    verses: [new Verse({ id: 3, chapter: 5, verseNum: 3, text: 'And after this manner of language had my mother complained against my father.', version: 'LDS' })],
    chapterHeading: { summary },
    config: { version: 'LDS', _subChapter: subChapter },
  });

  test('a verse or verse range leads with its own text, not the chapter summary', () => {
    const { description } = new HtmlPresenter()._buildOgMeta(page(true), {}, '1 Nephi 5:3', null);
    expect(description).toBe('1 Nephi 5:3— And after this manner of language had my mother complained against my father.');
  });

  test('a whole chapter leads with the chapter summary', () => {
    const { description } = new HtmlPresenter()._buildOgMeta(page(false), {}, '1 Nephi 5', null);
    expect(description.startsWith(`1 Nephi 5— ${summary} And after`)).toBe(true);
  });
});

describe('HtmlPresenter page title', () => {
  // referenceFromVerseIds ports PHP's "$dbook $r" join, which leaves two spaces after ";" when the
  // book is not repeated; the meta and api formats keep that, the page title does not
  test('one space after ";" in a title of several pieces', () => {
    const result = { title: 'Isaiah 56:9–58:14;  65–66:17', reference: {} };
    expect(new HtmlPresenter().titleFor(result, {}, {})).toBe('Isaiah 56:9–58:14; 65–66:17');
  });
  test('a title without pieces is unchanged', () => {
    expect(new HtmlPresenter().titleFor({ reference: {} }, { title: 'John 3:16' }, {})).toBe('John 3:16');
  });
});

describe('HtmlPresenter: the note on an unknown version', () => {
  const render = versionNote => {
    const result = crossChapter('Genesis 29:31-30:3', 31);
    result.versionNote = versionNote;
    let locals;
    new HtmlPresenter().present(result, { headers: {}, path: '/' }, { render: (view, l) => { locals = l; } });
    return locals;
  };
  test('is passed to the page, escaped', () => {
    expect(render('There is no version "<B>". Showing LDS.').versionNote).toBe('There is no version &quot;&lt;B&gt;&quot;. Showing LDS.');
  });
  test('none without one', () => {
    expect(render(undefined).versionNote).toBeNull();
  });
});

// The page's API URL (<link rel="alternate" type="application/json">)
describe('HtmlPresenter api alternate link', () => {
  const LAYOUT = fileURLToPath(new URL('../../src/presentation/views/layouts/main.ejs', import.meta.url));
  function john316({ versionSpec = null, version = 'NRSV', slug = 'john.3.16', normalized = 'John 3:16', verses = true } = {}) {
    return new ScriptureResult({
      reference: new Reference({ query: 'john.3.16', normalized, verseIds: verses ? [26137] : [] }),
      verses: verses ? [new Verse({ id: 26137, chapter: 3, verseNum: 16, text: 'For God so loved the world.', version })] : [],
      headings: [],
      config: { version, versionSpec, _bookTitle: 'John', _canonicalRefSlug: slug },
    });
  }
  function present(result) {
    let locals;
    new HtmlPresenter().present(result, { headers: { host: 'scripture.guide' }, path: '/x' }, { render: (view, l) => { locals = l; } });
    return locals.apiAlternate;
  }

  test('/nrsv/john.3.16 links to /v1/nrsv/john.3.16', () => {
    expect(present(john316({ versionSpec: 'NRSV' }))).toBe('https://api.scripture.guide/v1/nrsv/john.3.16');
  });
  test('/john.3.16 links to /v1/john.3.16: the API picks the same default version', () => {
    expect(present(john316())).toBe('https://api.scripture.guide/v1/john.3.16');
  });
  test('the version is the one shown, not the segment as typed', () => {
    // "/kjv,nrsv/…" (the site's separators) and "/hbrs/…" (no such version, the page falls back)
    expect(present(john316({ versionSpec: 'kjv,nrsv', version: 'KJV' }))).toBe('https://api.scripture.guide/v1/kjv/john.3.16');
    expect(present(john316({ versionSpec: 'hbrs', version: 'LDS' }))).toBe('https://api.scripture.guide/v1/lds/john.3.16');
  });
  test('a page showing several versions names each, in order, once', () => {
    const result = john316({ versionSpec: 'kjv.nrsv', version: 'KJV' });
    result.verses.push(new Verse({ id: 26137, chapter: 3, verseNum: 16, text: 'For God so loved the world.', version: 'NRSV' }),
      new Verse({ id: 26138, chapter: 3, verseNum: 17, text: 'Indeed, God did not send.', version: 'NRSV' }));
    expect(present(result)).toBe('https://api.scripture.guide/v1/kjv.nrsv/john.3.16');
    const partly = john316({ versionSpec: 'kjv.nrsv', version: 'KJV' });
    partly.verses.push(new Verse({ id: 26138, chapter: 3, verseNum: 17, text: 'x', version: 'INDEX' }));
    expect(present(partly)).toBe('https://api.scripture.guide/v1/kjv/john.3.16');
  });
  test('no link without verses, for a not-found page, or for text only in the verse index', () => {
    expect(present(john316({ verses: false }))).toBeNull();
    expect(present(john316({ normalized: '' }))).toBeNull();
    expect(present(john316({ slug: '' }))).toBeNull();
    expect(present(john316({ versionSpec: 'nrsv', version: 'INDEX' }))).toBeNull();
    const unversioned = john316({ versionSpec: 'nrsv' });
    unversioned.verses[0].version = undefined;
    expect(present(unversioned)).toBeNull();
  });
  test('the layout writes the link, escaped, only when there is one', async () => {
    const render = locals => ejs.renderFile(LAYOUT, { body: '<div id="container"></div>', config: {}, ...locals });
    const html = await render({ apiAlternate: 'https://api.scripture.guide/v1/nrsv/d&c.84' });
    expect(html).toContain('<link rel="alternate" type="application/json" href="https://api.scripture.guide/v1/nrsv/d&amp;c.84">');
    expect(await render({})).not.toContain('rel="alternate"');
    expect(await render({ apiAlternate: null })).not.toContain('rel="alternate"');
  });
});
