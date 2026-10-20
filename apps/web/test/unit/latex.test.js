import { describe, it, expect } from 'vitest';
import { renderLatex, segment, escapeHeading, html2latex, footnoteIds } from '../../src/presentation/latex/LatexRenderer.js';
import { LatexPresenter } from '../../src/presentation/presenters/formats/latex.js';
import { flag, option } from '../../src/presentation/formatOptions.js';

// Fixtures: KJV (public domain) and hand-written strings. Verse ids are the canonical ones.
const JOHN_3_16 = 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.';
const INFO = {
  1: { book_id: 1, chapter: 1, verse: 1 },
  2: { book_id: 1, chapter: 1, verse: 2 },
  31: { book_id: 1, chapter: 1, verse: 31 },
  32: { book_id: 1, chapter: 2, verse: 1 },
  26137: { book_id: 43, chapter: 3, verse: 16 },
};

function ctx(over = {}) {
  return {
    slides: false,
    chapterKey: id => (INFO[id] ? `${INFO[id].book_id}.${INFO[id].chapter}` : null),
    verseRef: id => INFO[id] || null,
    level: () => null,
    footnote: () => null,
    ...over,
  };
}

const V = '\\versenum \\marks\\versemarker{\\thescriptureverse}';

describe('segment', () => {
  it('splits text at format markers, keeping the marker run and the verse format on the first piece', () => {
    const list = segment([{ verse_id: 1, format: 'prose', text: '§A Psalm.¶▼The Lord/_is my shepherd' }]);
    expect(list).toEqual([
      { verse_id: 1, start: 'prose', fchar: '▫§', text: 'A Psalm.' },
      { verse_id: 1, fchar: '¶▼', text: 'The Lord' },
      { verse_id: 1, fchar: '/_', text: 'is my shepherd' },
    ]);
  });
});

describe('renderLatex prose', () => {
  it('renders a single verse like the live john.3.16', () => {
    const out = renderLatex([{ verse_id: 26137, format: 'prose', text: '¶' + JOHN_3_16, headings: null }], ctx());
    expect(out).toBe(`\n\n\\needspace{.1\\textheight}\\begin{scripturechapter} ${V}${JOHN_3_16} \\end{scripturechapter}`);
  });

  it('opens and closes a chapter environment at each chapter change, with a chapter marker after a heading', () => {
    const rows = [
      { verse_id: 31, format: 'prose', text: '¶And God saw every thing that he had made.', headings: null },
      { verse_id: 32, format: 'prose', text: '§¶Thus the heavens and the earth were finished.', headings: { title: 'Genesis 2' } },
    ];
    expect(renderLatex(rows, ctx())).toBe(
      `\n\n\\needspace{.1\\textheight}\\begin{scripturechapter} ${V}And God saw every thing that he had made. \\end{scripturechapter}` +
      `\n\n\\marks\\chaptermarker{2}\n\n\\begin{scripturechapter} ${V}Thus the heavens and the earth were finished. \\end{scripturechapter}`
    );
  });

  it('collapses whitespace and converts bold and sans-serif marks', () => {
    const out = renderLatex([{ verse_id: 1, format: 'prose', text: 'In  the 「beginning」\n⦅God⦆', headings: null }], ctx());
    expect(out).toContain('In the \\textbf{beginning} \\ssfname{God} ');
  });

  it('starts a no-indent paragraph on ◄', () => {
    const out = renderLatex([{ verse_id: 1, format: 'prose', text: '◄In the beginning', headings: null }], ctx());
    expect(out.startsWith('\\noindent \\needspace')).toBe(true);
  });
});

describe('renderLatex poetry and indent', () => {
  it('wraps poetry lines in a poem environment with indents and verse numbers', () => {
    const rows = [
      { verse_id: 1, format: 'prose', text: '§Title.¶▼The first line', headings: { heading: 'A Song' } },
      { verse_id: 2, format: 'poetry', text: '/_second line;/third line', headings: null },
    ];
    expect(renderLatex(rows, ctx())).toBe(
      '\n\n\\needspace{.16\\textheight}\\subsection[\\hspace{0cm}A Song]{A Song}\n\n\n\\marks\\chaptermarker{1}' +
      `\\begin{scripturechapter} ${V}Title. ` +
      '\\\\\n\\vspace{-.8em}\n\\begin{poem}\n\t\\hspace{1em}The first line ' +
      '\\\\\n\t\\hspace{3em}\\poemversenum{2}\\hspace{-2pt}\\marks\\versemarker{\\thescriptureverse}second line; ' +
      '\\\\\n\t\\hspace{1em}third line \\\\\n\\end{poem}%END%\n\\end{scripturechapter}'
    );
  });

  it('uses slide spacing for poems when slides is on', () => {
    const rows = [{ verse_id: 1, format: 'poetry', text: '¶Line', headings: null }];
    expect(renderLatex(rows, ctx({ slides: true }))).toContain('\\vspace{-4em}');
    expect(renderLatex(rows, ctx({ slides: true }))).toContain('\\end{poem}%END%\n\n\\vspace{-2.001em}\n');
  });

  it('puts indented verses in an adjustwidth block', () => {
    const rows = [{ verse_id: 1, format: 'indent', text: 'Indented words', headings: null }];
    expect(renderLatex(rows, ctx())).toBe(
      '\\\\\\needspace{.1\\textheight}\\begin{scripturechapter} \n\\\\\n\\vspace{-1.2em}\n' +
      '\n\n\\begin{adjustwidth}{3em}{0em}\n\\hspace{-.5em}' + V + 'Indented words \\\\\n\\end{adjustwidth}\n\\end{scripturechapter}'
    );
  });
});

describe('renderLatex headings', () => {
  const headings = {
    part_title: 'Part/One', part_subtitle: 'Sub', book_title: 'Book', book_title2: 'Second',
    book_subtitle: 'Of Things', headnote: 'A ⦅note⦆…', heading: 'Head｢7｣', subheading: 'Below',
    editorial_note: 'Ed', title: 'ignored',
  };
  const rows = [{ verse_id: 1, format: 'prose', text: '§¶Text', headings }];

  it('emits part, book, headnote and subsection directives', () => {
    const out = renderLatex(rows, ctx({ level: (id, type) => (type === 'heading' ? 2 : null) }));
    expect(out).toContain('\n\n\\marks\\partmarker{Part One}\n\\part*{Part\\\\One\\\\ \\vspace{1em} \\LARGE{\\normalfont\\textit{Sub}}}\n\\addcontentsline{toc}{part}{Part One}');
    expect(out).toContain('\n\n\\marks\\bookmarker{Book}\n\\book{Book\\\\Second}{Book}\n\\vspace{-3em}\n\\textit{\\largeOf Things}\n');
    expect(out).toContain('\n\n\\vspace{1.0001em} \n');
    expect(out).toContain('\\begin{quote}\\footnotesizeA \\hssfname{note}{$\\cdots$}\\vspace{-1.7em}\\end{quote}\n');
    expect(out).toContain('\\subsection[\\hspace{1cm}Head]{Head \\\\\\hspace*{1em}\\footnotesize\\normalfont\\textit{Below}\\\\\\hspace*{2em}\\scriptsize\\normalfont{Ed}}\n');
    expect(out).not.toContain('ignored');
  });

  it('drops the part in slides mode and starts a new page', () => {
    const out = renderLatex(rows, ctx({ slides: true }));
    expect(out.startsWith('\n\n\\newpage  \n')).toBe(true);
    expect(out).not.toContain('\\part*');
  });

  it('turns translated KRSEB footnotes into \\footnote and drops the rest', () => {
    const notes = {
      7: { note_id: 7, verse_id: 2, verse: 2, html: 'See <em>this</em> &amp; that~1 −3.', type: '', audit: 'translated' },
      8: { note_id: 8, verse_id: 2, verse: 2, html: 'English', type: 'eng', audit: 'eng' },
    };
    const out = renderLatex(
      [{ verse_id: 1, format: 'prose', text: 'One ｢7｣ two ｢8｣ three', headings: null }],
      ctx({ footnote: id => notes[id] || null })
    );
    expect(out).toContain('One\\footnote{\\hspace{-.7em}\\textsuperscript{\\tiny{~2}}\\footnotesize~See \\textit{this} & that\\texttt{\\char`\\~}1 \\textminus3} two three ');
  });

  it('applies the hard-coded page break one-offs', () => {
    const out = renderLatex([{ verse_id: 36306, format: 'prose', text: '§¶x', headings: null }], ctx());
    expect(out.startsWith('\\clearpage\n')).toBe(true);
  });
});

describe('helpers', () => {
  it('escapes heading text', () => {
    expect(escapeHeading('a/b~c…')).toBe('a\\\\b\\texttt{\\char`\\~}c{$\\cdots$}');
    expect(escapeHeading('a/b', true)).toBe('a b');
  });
  it('converts note html', () => {
    expect(html2latex('<span>x</span> <sup>2</sup> &#8212;')).toBe('x \\textsuperscript{2} —');
  });
  it('collects footnote ids from text and headings', () => {
    expect(footnoteIds([{ text: 'a｢3｣', headings: { heading: 'b｢4｣' } }]).sort()).toEqual([3, 4]);
  });
  it('picks the text version as PHP renderRaw did', () => {
    expect(LatexPresenter.textVersion({ config: { version: 'kjv*mev.rebom' } })).toBe('KJV');
    expect(LatexPresenter.textVersion({ config: {} })).toBe('LDS');
  });
});

describe('formatOptions', () => {
  it('reads query flags the PHP way', () => {
    expect(flag({ query: { slides: '' } }, 'slides')).toBe(true);
    expect(flag({ query: { slides: '0' } }, 'slides')).toBe(false);
    expect(flag({ query: {} }, 'slides')).toBe(false);
    expect(flag({ config: { options: { slides: 1 } }, query: {} }, 'slides')).toBe(true);
    expect(option({ query: { source: 'a,b' } }, 'source')).toBe('a,b');
  });
});
