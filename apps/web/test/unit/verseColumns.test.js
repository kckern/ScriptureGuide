import { describe, test, expect } from 'vitest';
import ejs from 'ejs';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { HtmlPresenter } from '../../src/presentation/presenters/HtmlPresenter.js';
import { Verse } from '../../src/domain/entities/Verse.js';
import { Reference } from '../../src/domain/entities/Reference.js';
import { ScriptureResult } from '../../src/domain/entities/ScriptureResult.js';

// Editions with one verse per paragraph (every verse starts with ¶: KJV, LDS) get their verse
// paragraphs in <div class="vcols">, which the CSS sets in two columns from the first paint.
const SECTION = fileURLToPath(new URL('../../src/presentation/views/partials/section.ejs', import.meta.url));
const PASSAGE = fileURLToPath(new URL('../../src/presentation/views/partials/passage.ejs', import.meta.url));

function result(texts, { headings, version = 'KJV' } = {}) {
  const ids = texts.map((_, i) => i + 1);
  const verses = texts.map((text, i) => new Verse({ id: i + 1, verseNum: i + 1, chapter: 1, text, version }));
  return new ScriptureResult({
    reference: new Reference({ query: 'Genesis 1', normalized: 'Genesis 1', verseIds: ids }),
    verses,
    headings: headings || [{ verse_id: 1, type: 'heading', text: '', last_verse_id: ids.length, synthetic: true, _wholeChapter: true }],
    config: { version, _bookTitle: 'Genesis' },
  });
}
const render = async (r, view = SECTION) => cheerio.load(await ejs.renderFile(view, { data: new HtmlPresenter().serialize(r) }));

describe('verse-per-paragraph passages', () => {
  test('every verse its own paragraph: the paragraphs are wrapped, the heading is not', async () => {
    const $ = await render(result(['§¶In the beginning.', '¶And the earth.', '¶And God said.']));
    expect($('.vcols').length).toBe(1);
    expect($('.vcols > p.prose').length).toBe(3);
    expect($('.vcols h3').length).toBe(0);
    expect($('.passage > h3.heading').length).toBe(1);
    expect($('.passage > .vcols').length).toBe(1);
  });
  test('each wrapper starts with an empty running head, so its height is there from the first paint', async () => {
    const $ = await render(result(['§¶In the beginning.', '¶And the earth.']));
    const head = $('.vcols > .vhead');
    expect(head.length).toBe(1);
    expect($('.vcols').children().first().is('.vhead')).toBe(true);
    expect(head.attr('aria-hidden')).toBe('true');
    expect(head.text()).toBe('');
  });
  test('the /passage form (version switch) carries the wrapper too', async () => {
    const $ = await render(result(['§¶In the beginning.', '¶And the earth.']), PASSAGE);
    expect($('.vcols > p.prose').length).toBe(2);
  });
  test('real paragraphs (a verse without ¶ joins the one before) are left alone', async () => {
    const $ = await render(result(['§¶In the beginning.', 'And the earth.', '¶And God said.']));
    expect($('.vcols').length).toBe(0);
    expect($('p.prose').length).toBe(2);
  });
  test('poetry is left alone', async () => {
    const $ = await render(result(['§¶In the beginning.', '¶▼Sing unto the Lord/a new song.']));
    expect($('.vcols').length).toBe(0);
  });
  test('a single verse is left alone', async () => {
    const $ = await render(result(['§¶In the beginning.']));
    expect($('.vcols').length).toBe(0);
  });
  test('each section is decided and wrapped on its own', async () => {
    const r = result(['§¶One.', '¶Two.', '§¶Three.', 'Four.'], {
      headings: [
        { verse_id: 1, type: 'heading', text: 'First', last_verse_id: 2 },
        { verse_id: 3, type: 'heading', text: 'Second', last_verse_id: 4 },
      ],
    });
    const $ = await render(r);
    const passages = $('.passage').filter((i, el) => $(el).find('h3.heading').length > 0);
    expect(passages.length).toBe(2);
    expect(passages.eq(0).find('.vcols > p').length).toBe(2);
    expect(passages.eq(1).find('.vcols').length).toBe(0);
  });
});

// public/js/columns.js: how the verses of a section are grouped into blocks
describe('columns.js partition', async () => {
  const { readFileSync } = await import('node:fs');
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
  dom.window.eval(readFileSync(new URL('../../public/js/columns.js', import.meta.url), 'utf8'));
  const { partition } = dom.window.SGColumns;
  const sums = (groups, h) => groups.map(g => g.reduce((a, i) => a + h[i], 0) / 2);

  test('every verse once, in order, and each block within the limit', () => {
    const h = Array.from({ length: 176 }, (_, i) => 40 + ((i * 37) % 90));
    const groups = partition(h, [700], 52);
    expect(groups.flat()).toEqual(h.map((_, i) => i));
    for (const s of sums(groups, h)) expect(s + 52).toBeLessThanOrEqual(700);
    expect(groups.length).toBeGreaterThan(1);
  });
  test('a short section stays one block', () => {
    expect(partition([60, 80, 60, 40], [700], 52)).toEqual([[0, 1, 2, 3]]);
  });
  test('a short last block shares the verses of the one before', () => {
    const h = Array(13).fill(100); // 12 fit a block (600 + 52 ≤ 700); one would be left alone
    const groups = partition(h, [700], 52);
    expect(groups.map(g => g.length)).toEqual([7, 6]);
  });
  test('the first block gets its own room; a short last block is not shared with it', () => {
    const h = Array(13).fill(100);
    expect(partition(h, [300, 700], 52).map(g => g.length)).toEqual([4, 9]);
    expect(partition(Array(10).fill(100), [300, 700], 52).map(g => g.length)).toEqual([4, 6]);
  });
  test('a verse taller than the limit gets a block of its own', () => {
    expect(partition([100, 2000, 100], [700], 52)).toEqual([[0], [1], [2]]);
  });
});

describe('columns.js running-head labels', async () => {
  const { readFileSync } = await import('node:fs');
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
  dom.window.eval(readFileSync(new URL('../../public/js/columns.js', import.meta.url), 'utf8'));
  const { rangeLabel } = dom.window.SGColumns;
  test.each([
    ['John 14:1', 'John 14:1', 'John 14:1'],
    ['John 14:1', 'John 14:10', 'John 14:1–10'],
    ['John 14:30', 'John 15:2', 'John 14:30–15:2'],
    ['1 Nephi 1:1', '1 Nephi 1:8', '1 Nephi 1:1–8'],
    ['Doctrine and Covenants 25:1', 'Doctrine and Covenants 25:16', 'Doctrine and Covenants 25:1–16'],
  ])('%s .. %s → %s', (a, b, label) => expect(rangeLabel(a, b)).toBe(label));
  test('an empty column has no label', () => expect(rangeLabel(undefined, undefined)).toBe(''));
});
