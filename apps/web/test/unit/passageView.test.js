import { describe, test, expect } from 'vitest';
import ejs from 'ejs';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { HtmlPresenter } from '../../src/presentation/presenters/HtmlPresenter.js';
import { Verse } from '../../src/domain/entities/Verse.js';
import { Reference } from '../../src/domain/entities/Reference.js';
import { ScriptureResult } from '../../src/domain/entities/ScriptureResult.js';

const VIEW = fileURLToPath(new URL('../../src/presentation/views/partials/passage.ejs', import.meta.url));

// A whole chapter (synthetic KJV-style text) whose heading carries a background and a summary.
function chapter() {
  const verses = [1, 2, 3].map(n => new Verse({ id: n, verseNum: n, chapter: 1, text: `${n === 1 ? '§¶' : '¶'}In the beginning.`, version: 'LDS' }));
  return new ScriptureResult({
    reference: new Reference({ query: 'Genesis 1', normalized: 'Genesis 1', verseIds: [1, 2, 3] }),
    verses,
    headings: [
      { verse_id: 1, type: 'heading', text: '', last_verse_id: 3, synthetic: true, _wholeChapter: true },
      { verse_id: 1, type: 'background', text: 'Background text' },
      { verse_id: 1, type: 'summary', text: 'Summary text' },
    ],
    chapterHeading: { verse_id: 1, background: 'Background text', summary: 'Summary text', last: 3 },
    config: { version: 'LDS', _bookTitle: 'Genesis', _faxIds: [1, 2, 3] },
  });
}

describe('passage partial (passage_script.php)', () => {
  test('renders the page passage: header rows and fax, no passage wrapper or nav', async () => {
    const data = new HtmlPresenter().serialize(chapter());
    data.chapterNav = { prev: { href: '/x', label: 'X' } };
    const $ = cheerio.load(await ejs.renderFile(VIEW, { data }));
    expect($('div.background').text()).toBe('Background text');
    expect($('div.summary').text()).toBe('Summary text');
    expect($('h3.heading').attr('fax')).toBe('1');
    expect($('div.passage').length).toBe(0);
    expect($('.chapterNav').length).toBe(0);
  });
});

describe('reference that matched nothing', () => {
  const XSS = '<img src=x onerror=alert(1)>';
  const empty = query => new ScriptureResult({
    reference: new Reference({ query, normalized: '', verseIds: [] }), verses: [], headings: [], config: { version: 'KJV' },
  });
  test('the blank heading escapes the requested text (/passage)', async () => {
    const html = await ejs.renderFile(VIEW, { data: new HtmlPresenter().serialize(empty(XSS)) });
    expect(html).not.toContain('<img');
    expect(cheerio.load(html)('h3').text().toLowerCase()).toBe(XSS);
  });
  test('the blank heading escapes the requested text (scripture page)', async () => {
    const SECTION = fileURLToPath(new URL('../../src/presentation/views/partials/section.ejs', import.meta.url));
    const html = await ejs.renderFile(SECTION, { data: new HtmlPresenter().serialize(empty(`xyz.1${XSS}`)) });
    expect(html).not.toContain('<img');
    expect(cheerio.load(html)('h3').text().toLowerCase()).toBe('xyz 1<img src=x onerror=alert(1)>');
  });
});

// Book of Commandments 27: verse 0 sits between verses 1 and 2 (verse id order)
function withVerseZero() {
  const rows = [[90101, 1], [90102, 0], [90103, 2]];
  const verses = rows.map(([id, verseNum]) => new Verse({ id, verseNum, chapter: 27, text: '¶And it came to pass.', version: '1833' }));
  return new ScriptureResult({
    reference: new Reference({ query: 'boc.27.1,0,2', normalized: 'Book of Commandments 27:1,0,2', verseIds: rows.map(r => r[0]) }),
    verses,
    headings: [{ verse_id: 90101, type: 'heading', text: '', last_verse_id: 90103, synthetic: true }],
    config: { version: '1833', _bookTitle: 'Book of Commandments', _vChapterMap: Object.fromEntries(rows.map(r => [r[0], 27])) },
  });
}

describe('verse 0', () => {
  test('stays in the heading ref and slug, in verse id order', () => {
    const h = new HtmlPresenter().serialize(withVerseZero()).h3ByVerse[90101];
    expect(h.ref).toBe('Book of Commandments 27:1,0,2');
    expect(h.slug).toBe('1833/book.of.commandments.27.1,0,2');
  });
  test('has no verse_label (PHP dropped the empty() "0" attribute)', async () => {
    const data = new HtmlPresenter().serialize(withVerseZero());
    const $ = cheerio.load(await ejs.renderFile(VIEW, { data }));
    expect($('span.v_90102').attr('verse_label')).toBeUndefined();
    expect($('span.v_90103').attr('verse_label')).toBe('2');
  });
});

// Live (scriptures.php renderHTMLElement) wraps h3 content in "\n\t\t\t". main.js appends the
// heading's buttons inside the h3, so the trailing whitespace renders as a space before them.
describe('heading whitespace', () => {
  test('the heading text sits between newline-tab runs, as on live', async () => {
    const SECTION = fileURLToPath(new URL('../../src/presentation/views/partials/section.ejs', import.meta.url));
    const html = await ejs.renderFile(SECTION, { data: new HtmlPresenter().serialize(chapter()) });
    expect(html).toMatch(/<h3 class="heading"[^>]*>\n\t\t\tGenesis 1\n\t\t\t<\/h3>/);
  });
});

// NIV Ps. 23 (synthetic text): the first verse opens with a superscription after "§", not "§¶",
// and the lookup heads the passage with the section at that verse (owner decision 2026-10-22).
describe('a passage whose first verse starts a section with "§"', () => {
  function psalm(first) {
    const texts = [first, '/_He makes me lie down.', '/_He refreshes my soul.'];
    const verses = texts.map((text, i) => new Verse({ id: 209 + i, verseNum: i + 1, chapter: 23, text, version: 'NIV' }));
    return new ScriptureResult({
      reference: new Reference({ query: 'Psalms 23', normalized: 'Psalms 23', verseIds: [209, 210, 211] }),
      verses,
      headings: [{ verse_id: 209, type: 'heading', text: 'Psalm 23', last_verse_id: 211, book_id: 19 }],
      chapterHeading: { verse_id: 209, version: 'NIV', heading: 'Psalm 23', last: 211 },
      config: { version: 'NIV', _bookTitle: 'Psalms', _vChapterMap: { 209: 23, 210: 23, 211: 23 } },
    });
  }
  const SECTION = fileURLToPath(new URL('../../src/presentation/views/partials/section.ejs', import.meta.url));
  const render = async first => cheerio.load(await ejs.renderFile(SECTION, { data: new HtmlPresenter().serialize(psalm(first)) }));

  test('is headed by that section, in the version\'s passage, with no ellipsis', async () => {
    const $ = await render('§A psalm of David.¶▼The Lord is my shepherd');
    expect($('h3.heading').length).toBe(1);
    expect($('h3.heading').text().trim()).toBe('Psalm 23');
    expect($('h3.heading').attr('heading_verse_id')).toBe('209');
    expect($('h3.heading').parent().attr('class')).toBe('passage ver_NIV');
    expect($('p.ellipses').length).toBe(0);
  });
  test('as a "§¶" first verse is (unchanged)', async () => {
    const $ = await render('§¶The Lord is my shepherd');
    expect($('h3.heading').text().trim()).toBe('Psalm 23');
    expect($('h3.heading').parent().attr('class')).toBe('passage ver_NIV');
  });
});

// Book openings (synthetic text) whose first verse has text before the section's "§¶": a
// division label (NIV Ps. 1:1 "§Psalms 1–41§¶Blessed…") or an incipit (ESV Obad. 1
// "¶The vision of Obadiah.§¶Thus says…"). Live puts that text in a passage of its own before
// the heading's passage (headed there by the previous book's last section, which Node drops),
// and shows the book title (h2) with the heading.
describe('a first verse with text before its "§¶"', () => {
  const SECTION = fileURLToPath(new URL('../../src/presentation/views/partials/section.ejs', import.meta.url));
  async function render(version, first, chapterHeading, title, heading) {
    const verses = [first, '¶But whose delight'].map((text, i) =>
      new Verse({ id: 1 + i, verseNum: i + 1, chapter: 1, text, version }));
    const result = new ScriptureResult({
      reference: new Reference({ query: 'Psalms 1', normalized: 'Psalms 1', verseIds: [1, 2] }),
      verses,
      headings: [
        { verse_id: 1, type: 'heading', text: heading, last_verse_id: 2, book_id: 19 },
        { verse_id: 1, type: 'title', text: title, book_id: 19 },
      ],
      chapterHeading,
      config: { version, _bookTitle: title, _vChapterMap: { 1: 1, 2: 1 } },
    });
    const html = await ejs.renderFile(SECTION, { data: new HtmlPresenter().serialize(result) });
    return { html, $: cheerio.load(html) };
  }
  const passages = $ => $('div.passage').toArray().map(p => ({
    cls: $(p).attr('class'), h2: $(p).children('h2').text().trim(), h3: $(p).children('h3.heading').text().trim(), text: $(p).find('span.verse').first().text(),
  }));

  test('the label gets a passage in the version, then the title and heading (NIV Ps. 1)', async () => {
    const { $ } = await render('NIV', '§Psalms 1–41§¶Blessed is the one', { verse_id: 1, version: 'NIV', heading: 'Psalm 1', title: 'Psalms', last: 2 }, 'Psalms', 'Psalm 1');
    expect(passages($)).toEqual([
      { cls: 'passage ver_NIV', h2: '', h3: '', text: '§Psalms 1–41' },
      { cls: 'passage ver_NIV', h2: 'Psalms', h3: 'Psalm 1', text: 'Blessed is the one' },
    ]);
  });
  test('as does an incipit before the first section, with the book title (ESV Obad. 1)', async () => {
    const { $ } = await render('ESV', '¶The vision of Obadiah.§¶Thus says the Lord', null, 'Obadiah', 'Edom Will Be Humbled');
    expect(passages($)).toEqual([
      { cls: 'passage ver_ESV', h2: '', h3: '', text: 'The vision of Obadiah.' },
      { cls: 'passage ver_ESV', h2: 'Obadiah', h3: 'Edom Will Be Humbled', text: 'Thus says the Lord' },
    ]);
  });
  test('markdown and xml keep the label (passages in the version)', async () => {
    const { passageSections } = await import('../../src/presentation/documents/passageTree.js');
    const { html } = await render('NIV', '§Psalms 1–41§¶Blessed is the one', { verse_id: 1, version: 'NIV', heading: 'Psalm 1', last: 2 }, 'Psalms', 'Psalm 1');
    expect(JSON.stringify(passageSections(html))).toContain('Psalms 1–41');
  });
});

// NET Ps. 90:1 (synthetic text): a division label, then "§" and the superscription
describe('a first verse with a label before its "§"', () => {
  test('is headed by its section, the label leading the first paragraph (as NIV "§Psalms 90–106§A prayer…")', async () => {
    const verses = ['Book 4 (Psalms 90-106)§A prayer of Moses.¶▼Lord, you have been our refuge', '/_He leads me.'].map((text, i) =>
      new Verse({ id: 1 + i, verseNum: i + 1, chapter: 90, text, version: 'NET' }));
    const result = new ScriptureResult({
      reference: new Reference({ query: 'Psalms 90', normalized: 'Psalms 90', verseIds: [1, 2] }),
      verses,
      headings: [{ verse_id: 1, type: 'heading', text: 'Psalm 90', last_verse_id: 2, book_id: 19 }],
      chapterHeading: { verse_id: 1, version: 'NET', heading: 'Psalm 90', last: 2 },
      config: { version: 'NET', _bookTitle: 'Psalms', _vChapterMap: { 1: 90, 2: 90 } },
    });
    const SECTION = fileURLToPath(new URL('../../src/presentation/views/partials/section.ejs', import.meta.url));
    const $ = cheerio.load(await ejs.renderFile(SECTION, { data: new HtmlPresenter().serialize(result) }));
    expect($('div.passage').length).toBe(1);
    expect($('h3.heading').text().trim()).toBe('Psalm 90');
    expect($('h3.heading').next().text()).toBe('Book 4 (Psalms 90-106)§A prayer of Moses.');
  });
});
