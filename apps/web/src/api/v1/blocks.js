// Structured blocks from one version's stored verse rows: paragraphs, poetry and sense lines,
// subtitles, with inline marks as runs (runs.js). The markers are read as the site reads them
// (HtmlPresenter.serialize and partials/section.ejs):
//   - a verse splits into segments at its ¶ markers (VerseSerializer.splitSegments), and each
//     segment's format and paragraph class come from segmentFormats;
//   - a new block starts at a segment whose marker has ¶, at a one-segment verse whose stored p
//     is ¶, and where the format changes; otherwise the text continues the block it is in;
//   - prose and indent are paragraphs, poetry and sense have lines; ¶ inside poetry is a new
//     stanza (block);
//   - "/" starts a new line, and the "_"s after it give the line's indent. In prose the site
//     shows a "/" as a line break inside the paragraph; here it starts a paragraph with style
//     "linebreak", which the site's CSS draws the same way (p.prose.linebreak);
//   - a segment starting with § is a subtitle; text before a § in a segment is a label
//     paragraph ("Book II(Psalms 42–72)§To the leader…"), and the § text after it a subtitle;
//   - filler rows ("*" compound rows, "/" or spaces) add nothing: their text is in the verse
//     before.
// rows: [{ verse_id, verse, text, format, p }] in verse order.
import { VerseSerializer } from '../../presentation/serializers/VerseSerializer.js';
import { segmentFormats, isFillerText } from '../../domain/rules/legacyText.js';
import { toRuns, markSpans } from './runs.js';

const TYPES = Object.freeze({ prose: 'paragraph', indent: 'paragraph', poetry: 'poetry', sense: 'sense' });
const hasLines = format => format === 'poetry' || format === 'sense';

// Runs with the space at either end taken off; runs left empty are dropped
function trimRuns(runs) {
  const out = runs.map(r => ({ ...r }));
  while (out.length && !(out[0].text = out[0].text.trimStart())) out.shift();
  while (out.length && !(out[out.length - 1].text = out[out.length - 1].text.trimEnd())) out.pop();
  return out;
}

// The marker runs splitSegments splits at (VerseSerializer.splitSegments DELIM)
const MARKER_RUN = /([§‾▲]*¶[▲▼◤►◄↪]*)/u;

// A ▼ or ► outside a ¶ marker run (NIrV Gen. 2:23 "said,▼“Her bones…", the speaker labels in
// Song of Songs "chambers.►Friends¶▼…") switches the format as ¶▼ and ¶► do, as LatexRenderer
// reads them. The site's HTML leaves them in the text.
function loneSwitches(text) {
  return String(text ?? '').split(MARKER_RUN).map((piece, k) => (k % 2 ? piece : piece.replace(/[▼►]/gu, '¶$&'))).join('');
}

// A mark that spans line parts of one verse ("〔Humanity is humbled,/all people…〕") is closed
// at the end of each part and opened again at the start of the next, so each part's runs
// carry it. parts: [{ text }], changed in place.
function balanceMarks(parts) {
  const SEP = '\u0000';
  const starts = [];
  let at = 0;
  for (const p of parts) { starts.push(at); at += p.text.length + SEP.length; }
  const partAt = index => { let k = 0; while (k + 1 < starts.length && starts[k + 1] <= index) k++; return k; };
  const pre = parts.map(() => '');
  const post = parts.map(() => '');
  for (const span of markSpans(parts.map(p => p.text).join(SEP))) {
    const first = partAt(span.start);
    const last = partAt(span.end);
    if (first === last) continue;
    post[first] = span.close;
    for (let k = first + 1; k < last; k++) { pre[k] = span.open; post[k] = span.close; }
    pre[last] = span.open;
  }
  parts.forEach((p, k) => { p.text = pre[k] + p.text + post[k]; });
}

// One verse as a list of items, in order:
//   { kind: 'segment', format, style, paraBreak }  where a segment starts
//   { kind: 'line', text, lead, newLine }          its text, cut at "/" and "\" (lead: the "_"s
//                                                  before it; newLine: a break came before it)
//   { kind: 'subtitle', text }                     § text
function verseItems(row) {
  const segments = VerseSerializer.splitSegments(loneSwitches(row.text));
  const formats = segmentFormats(row.format, segments);
  const items = [];
  segments.forEach((seg, i) => {
    const format = TYPES[formats[i].format] ? formats[i].format : 'prose';
    items.push({
      kind: 'segment',
      format,
      style: formats[i].paraClass || (format === 'indent' ? 'indent' : null),
      paraBreak: seg.meta.includes('¶') || (i === 0 && segments.length === 1 && String(row.p ?? '').includes('¶')),
    });
    // ¶ left in a segment (a verse of only "¶") is dropped, as the site drops it
    const [body, ...subtitles] = seg.text.replace(/¶/gu, '').split('§');
    body.split(/[/\\]/).forEach((part, k) => {
      const lead = part.match(/^_*/)[0].length;
      items.push({ kind: 'line', text: part.slice(lead).replace(/_+\s*$/, ''), lead, newLine: k > 0 });
    });
    for (const text of subtitles) items.push({ kind: 'subtitle', text: text.replace(/[/\\_]+/g, ' ') });
  });
  balanceMarks(items.filter(item => item.kind !== 'segment'));
  return items;
}

// Every piece of a block, in order
export function blockPieces(block) {
  return block.lines ? block.lines.flatMap(l => l.pieces) : block.pieces;
}

export function buildBlocks(rows) {
  const blocks = [];
  let cur = null; // { format, pieces }: the block (or line) text goes on
  let want = null; // { format, style }: a block to open before the next text
  let pendingLine = null; // the indent of a line break not yet followed by text

  function open({ format, style }, indent) {
    const block = hasLines(format)
      ? { type: TYPES[format], style, lines: [{ indent, pieces: [] }] }
      : { type: 'paragraph', style, ...(indent ? { indent } : {}), pieces: [] };
    blocks.push(block);
    cur = { format, block, pieces: block.lines ? block.lines[0].pieces : block.pieces };
  }

  for (const row of rows) {
    if (isFillerText(row.text)) continue;
    let started = false;
    const piece = runs => {
      const p = { id: Number(row.verse_id), verse: row.verse ?? null, start: !started, runs };
      started = true;
      return p;
    };
    const append = (pieces, runs) => {
      if (pieces.length) {
        if (runs[0].mark) runs.unshift({ text: ' ' });
        else runs[0].text = ' ' + runs[0].text;
      }
      pieces.push(piece(runs));
    };

    // One line's text: lead is its count of leading "_", newLine whether a "/" came before it
    const add = (content, lead, newLine) => {
      if (newLine) pendingLine = lead;
      const runs = trimRuns(toRuns(content));
      if (!runs.length) return;
      if (want) {
        open(want, pendingLine ?? lead);
        want = null;
      } else if (pendingLine != null) {
        if (hasLines(cur.format)) {
          const line = { indent: pendingLine, pieces: [] };
          cur.block.lines.push(line);
          cur.pieces = line.pieces;
        } else {
          open({ format: cur.format, style: 'linebreak' }, pendingLine);
        }
      }
      pendingLine = null;
      append(cur.pieces, runs);
    };

    const subtitle = content => {
      const runs = trimRuns(toRuns(content));
      if (runs.length) blocks.push({ type: 'subtitle', pieces: [piece(runs)] });
      cur = null;
      want = null;
      pendingLine = null;
    };

    for (const item of verseItems(row)) {
      if (item.kind === 'subtitle') subtitle(item.text);
      else if (item.kind === 'line') add(item.text, item.lead, item.newLine);
      else if (item.paraBreak || (want?.format ?? cur?.format) !== item.format) {
        want = { format: item.format, style: item.style };
        pendingLine = null;
      }
    }
  }
  return blocks;
}
