import { describe, test, expect } from 'vitest';
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
});
