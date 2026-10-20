// LaTeX body fragment for a passage, ported from the PHP inc_latex.php (latex.scripture.guide).
//
// The PHP page was written for the Korean study edition of the Book of Mormon: footnotes and
// heading levels are always read from the KRSEB version, and a number of verse ids get
// hand-placed page breaks and spacing. Those one-offs are kept so the output matches.
//
// renderLatex() is synchronous and does no I/O. The caller supplies the verse rows and lookups:
//   rows: [{ verse_id, format, text, headings }] where headings is the loadHeading() map
//         (type → text) for verses whose text holds § or ▲, otherwise null
//   ctx:  {
//     slides:      boolean (?slides): presentation spacing instead of book spacing
//     chapterKey:  verse_id → string identifying its chapter (null for no verse)
//     verseRef:    verse_id → { chapter, verse } from lds_scriptures_verses
//     level:       (verse_id, type) → KRSEB heading level or null
//     footnote:    note_id → KRSEB scripture_footnotes row (+ verse number) or null
//   }

const WS = '[ \\t\\n\\r\\f\\v]'; // PCRE \s without UCP: ASCII whitespace only
const SPLIT = /([▫§¶◄►▼▲_/]+)/u;
const PREVERSE = '\\marks\\versemarker{\\thescriptureverse}';
const NEEDSPACE = '\\needspace{.1\\textheight}';

// One-off verse ids from the PHP source.
const TIGHT_HEADING = [31878, 32520]; // 2 Ne. 6 and similar
const WIDOWED_HEADINGS = [34074, 34847, 35757, 35938, 37412, 34925, 35463, 31690, 34503, 31877];
const FORCE_PAGE_BREAK = [36306];
const TOC_PAGE_BREAK = [32745, 35553, 35938, 33696, 34741, 37673]; // Omni, Hel., Samuel, Alma 5, Moroni 10
const MORMON_8 = 37033; // the new part begins with chapter 7

// PHP empty(): null, undefined, '', '0'
const empty = v => v === undefined || v === null || v === '' || v === '0' || v === 0 || v === false;
// PHP trim() default character set
const phpTrim = s => String(s ?? '').replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, '');
const fmt = (char, item) => new RegExp(char, 'u').test(item?.fchar ?? '');

const SUBSCRIPTS = { 1: '₁', 2: '₂', 3: '₃', 4: '₄' };
const subscript = s => s.replace(/([가-힣])([1-4])/gu, (m, h, n) => `${h}{\\normalfont ${SUBSCRIPTS[n]}}`);
const unsubscript = s => s.replace(/([가-힣])([1-4])/gu, '$1');
const stripNoteMarks = s => s.replace(/s*｢\d+｣/gu, ''); // sic: PHP pattern is "s*", not "\s*"
// The PHP pattern ran without /u, so [가-힣] was a byte class (0x80–0xED): it joins any two
// non-ASCII characters split by backslashes, the second starting below U+E000.
const joinBackslashBreaks = s => s.replace(
  new RegExp(`([\\u0080-\\u{10FFFF}])${WS}*\\\\+${WS}*([\\u0080-\\uDFFF])`, 'gu'), '$1 $2');
const boldface = s => s.replace(/「(.*?)」/gu, '\\textbf{$1}');
const sansserif = s => s.replace(/⦅(.*?)⦆/gu, '\\ssfname{$1}');
const hsansserif = s => s.replace(/⦅(.*?)⦆/gu, '\\hssfname{$1}');

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', '#039': "'" };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function html2latex(str) {
  return decodeEntities(String(str ?? ''))
    .replace(/<span>(.*?)<\/span>/g, '$1')
    .replace(/<em>(.*?)<\/em>/g, '\\textit{$1}')
    .replace(/<sup>(.*?)<\/sup>/g, '\\textsuperscript{$1}');
}

export function escapeHeading(str, slides) {
  return String(str ?? '')
    .split('…').join('{$\\cdots$}')
    .split('~').join('\\texttt{\\char`\\~}')
    .split('/').join(slides ? ' ' : '\\\\');
}

// Split raw verse rows into segments at the format markers, as the PHP did:
// each segment has verse_id, fchar (the marker run before it), text, and start (the verse's
// format) on the verse's first segment only.
export function segment(rows) {
  const list = [];
  let c = 0;
  for (const row of rows) {
    const lines = ('▫' + (row.text ?? '')).split(SPLIT);
    list[c] ??= {};
    list[c].verse_id = row.verse_id;
    list[c].start = row.format;
    for (let i = 1; i < lines.length; i++) {
      list[c] ??= {};
      list[c].verse_id = row.verse_id;
      if (i % 2 === 0) { list[c].text = lines[i]; c++; } else list[c].fchar = lines[i];
    }
  }
  return list;
}

export function renderLatex(rows, ctx) {
  const slides = !!ctx.slides;
  let out = '';
  const echo = s => { out += s; };

  const headingsById = {};
  for (const row of rows) {
    if (row.headings && Object.keys(row.headings).length) headingsById[row.verse_id] = row.headings;
  }

  function lookupFootnote(noteId) {
    if (slides) return ' ';
    const r = ctx.footnote(noteId);
    if (r && ['ver', 'eng'].includes(r.type)) return ' ';
    if (!r || !['translated', 'kor'].includes(r.audit)) return ' ';
    const verse = r.verse ?? ctx.verseRef(r.verse_id)?.verse ?? '';
    let note = html2latex(r.html);
    note = note.split('~').join('\\texttt{\\char`\\~}');
    note = note.split('…').join('{$\\cdots$}');
    note = note.replace(/−(\d+)/gu, '\\textminus$1');
    note = note.replace(new RegExp(`\\.${WS}*$`), '');
    return `\\footnote{\\hspace{-.7em}\\textsuperscript{\\tiny{~${verse}}}\\footnotesize~${note}} `;
  }

  function footnote(src) {
    return String(src ?? '')
      .replace(new RegExp(`${WS}*｢(\\d+)｣${WS}*`, 'gu'), (m, id) => lookupFootnote(id))
      .replace(new RegExp(`${WS}+`, 'g'), ' ');
  }

  const ems = (verseId, type) => {
    const level = ctx.level(verseId, type);
    return String((Number(level) || 0) * 0.5);
  };

  function headings(verseId, form) {
    if (TIGHT_HEADING.includes(verseId)) echo('\\\\\n\\vspace{-1.3em}');

    const h = {};
    for (const [k, v] of Object.entries(headingsById[verseId] || {})) h[k] = escapeHeading(v, slides);
    let {
      part_title, part_subtitle, book_title, book_title2, book_subtitle, book_headnote, headnote,
      supersection_title, supersection_subtitle, section_title, section_subtitle,
      heading, subheading, editorial_note, verse_head,
    } = h;

    if (slides && empty(verse_head) && !TIGHT_HEADING.includes(verseId)) echo('\n\n\\newpage  \n');
    if (slides && verseId === 31878) echo('\n\n\\vspace{-4em} \n');

    let superh = '45';
    let sectionh = '27';
    const headingh = '16';

    const { chapter } = ctx.verseRef(verseId) || {};

    if (WIDOWED_HEADINGS.includes(verseId)) { superh = '6'; sectionh = '5'; }
    if (FORCE_PAGE_BREAK.includes(verseId)) echo('\\clearpage\n');
    if (TOC_PAGE_BREAK.includes(verseId)) echo('\\addtocontents{toc}{\\protect\\newpage}\n');

    const tocOff = '\n\\addtocontents{toc}{\\let\\protect\\contentsline\\protect\\nopagecontentsline}\n';
    const tocOn = '\n\\addtocontents{toc}{\\let\\protect\\contentsline\\protect\\oldcontentsline}\n';

    if (!empty(part_title) && !slides) {
      const tocpart = part_title.split('\\\\').join(' ');
      echo(tocOff);
      echo(`\n\n\\marks\\partmarker{${tocpart}}`);
      echo(`\n\\part*{${part_title}\\\\ \\vspace{1em} \\LARGE{\\normalfont\\textit{${part_subtitle ?? ''}}}}\n\\addcontentsline{toc}{part}{${tocpart}}`);
      echo(tocOn);
    }

    if (!empty(book_title)) {
      const small = book_title;
      const full = empty(book_title2) ? book_title : `${book_title}\\\\${book_title2}`;
      echo(`\n\n\\marks\\bookmarker{${small}}`);
      echo(`\n\\book{${full}}{${small}}\n\\vspace{-3em}`);
      if (slides) echo('\n\n\\vspace{-2.5em} \n');
      // PHP "{$book_subtitle}" interpolated the variable, so no braces around the subtitle.
      if (!empty(book_subtitle)) echo(`\n\\textit{\\large${book_subtitle}}\n`);
      echo(tocOff);
      echo(tocOn);
      if (slides && !empty(book_subtitle)) echo('\n\n\\vspace{-1.5em} \n');
      if (slides && empty(book_subtitle)) echo('\n\n\\vspace{1.50001em} \n');
    }

    book_headnote = hsansserif(footnote(book_headnote));
    headnote = hsansserif(footnote(headnote));

    if (!empty(book_subtitle) && !empty(headnote)) echo('\n\n\\vspace{1.0001em} \n');
    if (!empty(book_headnote)) echo(`\\vspace{-.5em}\\begin{quote}\\footnotesize${book_headnote}\\vspace{-1.7em}\\end{quote}\n\n`);
    if (slides && empty(book_subtitle) && !empty(book_headnote + headnote)) echo('\n\n\\vspace{-2em} \n');

    if (!empty(supersection_title)) {
      let sub = empty(supersection_subtitle) ? '' : `\\hspace*{1em}\\normalfont\\large\\textit{${supersection_subtitle}}\\vspace{-1.5em}\\\\`;
      echo(`\n\\needspace{.${superh}\\textheight}${tocOff}`);
      const e = ems(verseId, 'supersection_title');
      let toc = unsubscript(supersection_title);
      let title = subscript(supersection_title);
      toc = joinBackslashBreaks(toc);
      toc = stripNoteMarks(toc);
      title = footnote(title);
      sub = footnote(sub);
      echo(`\n\\section[\\hspace{${e}cm}${toc}\\hspace{20cm}]{\\LARGE\\textbf{${title}}\\\\${sub}}\n`);
      echo(tocOn);
      if (slides) echo('\n\n\\vspace{-2.5em} \n');
    }

    if (!empty(section_title)) {
      echo(`\n\\needspace{.${sectionh}\\textheight}${tocOff}`);
      let sub = empty(section_subtitle) ? '' : `\\\\\\hspace*{1em}\\normalfont\\small\\textit{${section_subtitle}}`;
      const e = ems(verseId, 'section_title');
      let toc = unsubscript(section_title);
      let title = subscript(section_title);
      toc = joinBackslashBreaks(toc);
      title = footnote(title);
      sub = footnote(sub);
      toc = stripNoteMarks(toc);
      echo(`\n\\section[\\hspace{${e}cm}${toc}\\hspace{20cm}]{\\Large\\textbf{${title}${sub}}}\n`);
      echo(tocOn);
      if (slides) echo('\n\n\\vspace{-2em} \n');
    }

    if (!empty(headnote)) echo(`\\vspace{-.5em}\\begin{quote}\\footnotesize${headnote}\\vspace{-1.7em}\\end{quote}\n`);
    if (!empty(headnote) && slides) echo('\n\n\\vspace{-2em} \n');

    if (!empty(heading)) {
      let sub = '';
      let tocheading = stripNoteMarks(heading);
      let pageheading = footnote(heading);
      subheading = subscript(subheading ?? '');
      sub = empty(subheading) ? sub : `\\\\\\hspace*{1em}\\footnotesize\\normalfont\\textit{${subheading}}`;
      sub = empty(editorial_note) ? sub : `${sub}\\\\\\hspace*{2em}\\scriptsize\\normalfont{${editorial_note}}`;
      const e = ems(verseId, 'heading');
      pageheading = subscript(pageheading);
      tocheading = unsubscript(tocheading);
      tocheading = tocheading.split('\\\\').join(' ');
      echo(`\n\n\\needspace{.${headingh}\\textheight}\\subsection[\\hspace{${e}cm}${tocheading}]{${pageheading}${sub}}\n`);
      if (slides && form !== 'indent' && form !== 'poetry') echo('\n\n\\vspace{-1.2em} \n');
    }

    if (!empty(verse_head)) {
      if (slides) echo('\n\n\\vspace{-3em} \n');
      verse_head = footnote(verse_head);
      echo(`\n\n\\needspace{.15\\textheight}\n\\subsubsection*{\\hspace{3em}${verse_head}}\n`);
    }

    echo(`\n\n\\marks\\chaptermarker{${chapter ?? ''}}`);
    if (verseId === MORMON_8) echo('\\setcounter{scripturechapter}{7}\n\n');
  }

  const list = segment(rows);
  let form;
  let lastform;

  for (let i = 0; i < list.length; i++) {
    const item = { ...list[i] };
    const next = list[i + 1];
    const prev = list[i - 1];

    const ch = ctx.chapterKey(item.verse_id);
    const nextch = next ? ctx.chapterKey(next.verse_id) : null;
    const prevch = prev ? ctx.chapterKey(prev.verse_id) : null;

    // Format
    if (!empty(item.start)) form = item.start;
    if (fmt('▼', item)) {
      form = 'poetry';
      if (next?.start === 'indent') form = 'indent';
    }
    if (fmt('►', item)) form = 'prose';

    let hasHeading = false;
    if (fmt('[§▲]', item)) { headings(item.verse_id, form); hasHeading = true; }

    const needspace = hasHeading ? '' : NEEDSPACE;

    // Orientation
    const isFirstVerseInChapter = ch !== prevch;
    const isLastVerseInChapter = ch !== nextch;
    const isLastPoemVerse = form === 'poetry' && next?.start !== 'poetry' && !empty(next?.start);
    const isFirstPoemVerse = form === 'poetry' && lastform !== 'poetry';
    const isFirstIndent = form === 'indent' && lastform !== 'indent';
    let isLastIndent = form === 'indent' && next?.start !== 'indent' && !empty(next?.start);
    const islast = i === list.length - 1;
    const isNewParagraph = fmt('¶', item);
    const nextHasParagraph = fmt('¶', next);

    const begch = isFirstVerseInChapter ? `${needspace}\\begin{scripturechapter} ` : '';
    const firstinVerse = !prev || item.verse_id > prev.verse_id;
    const lastPoemBeforeHeading = isLastPoemVerse && fmt('[§▲]', next);

    if (item.start === 'indent' && fmt('[▼]', next)) isLastIndent = true;
    const nextHasHeading = fmt('[§▲]', next);

    item.text = sansserif(boldface(footnote(item.text)));

    if (form === 'prose') {
      if (fmt('¶', item)) echo('\n\n');
      if (fmt('◄', item) && !hasHeading) echo('\\noindent ');
      echo(begch);
      if (firstinVerse) echo(`\\versenum ${PREVERSE}`);
      echo(item.text + ' ');
    }

    if (form === 'indent') {
      if (isFirstVerseInChapter && slides) echo('\n\\vspace{-1.2em}\n');
      if (isFirstIndent) echo('\\\\');
      if (fmt('¶', item)) echo('\n\n');
      echo(begch);
      if (fmt('\\/', item)) echo('\\\\\n');
      if (isFirstVerseInChapter) echo('\n\\\\\n\\vspace{-1.2em}\n');
      if (isFirstIndent || hasHeading) echo('\n\n\\begin{adjustwidth}{3em}{0em}\n');
      if (slides && (isFirstIndent || hasHeading) && lastform !== 'poetry') echo(' \n\\vspace{-2.01em}\n');
      if (isFirstVerseInChapter) echo('\\hspace{-.5em}');
      if (firstinVerse) echo(`\\versenum ${PREVERSE}`);
      echo(item.text + ' ');
      if ((islast || isLastVerseInChapter || isLastIndent) && !nextHasHeading) echo('\\\\');
      if (islast || isLastVerseInChapter || isLastIndent || nextHasHeading) echo('\n\\end{adjustwidth}\n');
    }

    if (form === 'poetry') {
      echo(begch);
      const isPoemNewChapWithoutHeading = !hasHeading && isFirstVerseInChapter;
      const needsInvisibleSpace = isNewParagraph || isFirstVerseInChapter;
      const needsPoemStart = isFirstPoemVerse || isFirstVerseInChapter || isNewParagraph || hasHeading;
      const needsPoemEnd = islast || isLastVerseInChapter || isLastPoemVerse || nextHasHeading || nextHasParagraph;
      let vspace = isFirstVerseInChapter ? '-2.001em' : (isFirstPoemVerse ? '-.8em' : '-.3em');
      if (slides) vspace = isFirstVerseInChapter ? '-4em' : (isFirstPoemVerse ? '-1.50em' : '-.3em');
      if (slides && !isFirstVerseInChapter && isFirstPoemVerse) vspace = '-3em';

      if (needsInvisibleSpace) echo(`\\\\\n\\vspace{${vspace}}`);
      if (needsPoemStart) echo('\n\\begin{poem}\n');
      if (fmt('\\/', item)) echo('\\\\\n');

      if (fmt('___', item)) echo('\t\\hspace{7em}');
      else if (fmt('__', item)) echo('\t\\hspace{5em}');
      else if (fmt('_', item)) echo('\t\\hspace{3em}');
      else if (isFirstVerseInChapter && isFirstPoemVerse) echo('\t\\hspace{.4em}');
      else if (isPoemNewChapWithoutHeading) echo('\t\\hspace{.4em}');
      else echo('\t\\hspace{1em}');

      if (firstinVerse) {
        const distance = fmt('¶', item) ? '2.5' : '2';
        const indentLevel = item.fchar === '▫/_' ? 2 : 1;
        echo(`\\poemversenum{${indentLevel}}\\hspace{-${distance}pt}${PREVERSE}`);
      }

      echo(phpTrim(item.text) + ' ');

      if (needsPoemEnd) echo('\\\\\n\\end{poem}%END%\n');
      if (needsPoemEnd && slides) echo('\n\\vspace{-2.001em}\n');
    }

    if (isLastVerseInChapter || islast) echo('\\end{scripturechapter}');
    if (lastPoemBeforeHeading) echo('\n\\vspace{-1em}\n');

    lastform = form;
  }

  return out;
}

// Every ｢n｣ footnote id referenced by the rows' text or headings.
export function footnoteIds(rows) {
  const ids = new Set();
  const scan = s => { for (const m of String(s ?? '').matchAll(/｢(\d+)｣/gu)) ids.add(Number(m[1])); };
  for (const row of rows) {
    scan(row.text);
    for (const v of Object.values(row.headings || {})) scan(v);
  }
  return [...ids];
}

export default renderLatex;
