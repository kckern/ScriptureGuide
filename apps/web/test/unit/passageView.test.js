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
