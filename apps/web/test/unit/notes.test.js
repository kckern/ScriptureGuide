import { describe, it, expect } from 'vitest';
import * as cheerio from 'cheerio';
import { renderNotesPage, wordAnnotations, verseIdOf, HEAD } from '../../src/presentation/notes/NotesPage.js';
import { NotesPresenter } from '../../src/presentation/presenters/formats/notes.js';

// Synthetic notes only; the real commentary text is licensed.
const NOTE_A = { id: 2, html: '<p>First note.</p>', source_title: 'Source A & Co', source_name: 'Author A', source_slug: 'source-a' };
const NOTE_B = { id: 5, html: 'Second note.', source_title: 'Source B', source_name: 'Author B', source_slug: 'source-b' };

describe('wordAnnotations', () => {
  it('expands word runs into zero-padded word ids per verse', () => {
    const idx = wordAnnotations([
      { annotation_id: 2, type: 'word', verse_id: 31103, verse_count: 1, word_seq: 7, word_count: 2 },
      { annotation_id: 5, type: 'word', verse_id: 31103, verse_count: 2, word_seq: 8, word_count: 1 },
      { annotation_id: 9, type: 'word', verse_id: 31103, verse_count: 1, word_seq: null, word_count: null },
    ]);
    expect(idx[31103].word).toEqual({ '31103-0007': [2], '31103-0008': [2, 5] });
    expect(idx[31104].word).toEqual({ '31103-0008': [5] });
  });

  it('takes the verse id off a word id', () => {
    expect(verseIdOf('31103-0008')).toBe('31103');
    expect(verseIdOf('john.3.16')).toBe('john.3.16');
  });
});

describe('renderNotesPage', () => {
  it('renders the empty shell', () => {
    const html = renderNotesPage({ ref: '', notes: [], browser: 'chrome' });
    expect(html.startsWith(HEAD)).toBe(true);
    expect(html.slice(HEAD.length)).toBe(
      '\n<body class="chrome">\n\t<div align="center">\n\t<div id="container">\n\t\t<h3></h3>\n \n' +
      '<div id="accordion">\n\t\n</div>\n \n\t</div></div>\n</body>\n</html>\n \n</body>\n</html>\n\n'
    );
  });

  it('renders one accordion entry per note, unescaped like the PHP template', () => {
    const html = renderNotesPage({ ref: '1 Nephi 1:1', notes: [NOTE_A, NOTE_B], browser: 'chrome' });
    expect(html).toContain(
      '<div id="accordion">\n\t  <h5>Source A & Co</h5>\n  <div class="note">\n  \t<div class=\'src\'>\n' +
      '  \t\t<img src=\'http://bookofmormon.online/source/source-a\'>\n  \t\t<div>Author A</div>\n  \t\t  \t</div>\n' +
      '   <h6>“”</h6>\n   <p>First note.</p>  </div>\n   <h5>Source B</h5>'
    );
    const $ = cheerio.load(html);
    expect($('h3').text()).toBe('1 Nephi 1:1');
    expect($('#accordion h5').map((i, e) => $(e).text()).get()).toEqual(['Source A & Co', 'Source B']);
    expect($('.note .src img').attr('src')).toBe('http://bookofmormon.online/source/source-a');
  });
});

describe('NotesPresenter', () => {
  function fakeRepo() {
    const calls = {};
    return {
      calls,
      referenceFor: async id => (id === '31103' ? '1 Nephi 1:1' : ''),
      indexForVerses: async (ids, sources) => {
        calls.sources = sources;
        return [
          { annotation_id: 2, type: 'word', verse_id: 31103, verse_count: 1, word_seq: 7, word_count: 2 },
          { annotation_id: 5, type: 'word', verse_id: 31103, verse_count: 1, word_seq: 9, word_count: 1 },
        ];
      },
      notesByIds: async ids => [NOTE_A, NOTE_B].filter(n => ids.includes(n.id)),
    };
  }

  it('looks up the notes on the requested word', async () => {
    const repo = fakeRepo();
    const html = await new NotesPresenter(repo).render({ path: '/31103-0008', query: {} }, 'ie');
    expect(html).toContain('<h3>1 Nephi 1:1</h3>');
    expect(html).toContain('Source A & Co');
    expect(html).not.toContain('Source B');
    expect(html).toContain('<body class="ie">');
  });

  it('passes ?source to the index query', async () => {
    const repo = fakeRepo();
    await new NotesPresenter(repo).render({ path: '/31103-0008', query: { source: '21,51' } }, 'ie');
    expect(repo.calls.sources).toEqual(['21', '51']);
  });

  it('gives the empty shell for a reference instead of a word id', async () => {
    const html = await new NotesPresenter(fakeRepo()).render({ path: '/john.3.16', query: {} }, 'chrome');
    expect(html).toContain('<h3></h3>');
    expect(html).not.toContain('<h5>');
  });
});
