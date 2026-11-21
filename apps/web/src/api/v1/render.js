// Bodies for each host: api (full v1 JSON), and the simple formats json, yaml, markdown,
// text and raw built from the same passage object: text and markdown from its blocks, the json
// and yaml verse lists from its verses, raw from its stored rows. Content types live in CONTENT_TYPES.
import yaml from 'js-yaml';

// lineWidth -1: verse text stays on one line instead of folding at 80 columns.
// noRefs: a value used twice is written out twice, not as an &anchor.
const dumpYaml = value => yaml.dump(value, { lineWidth: -1, noRefs: true });

export const CONTENT_TYPES = Object.freeze({
  api: 'application/json; charset=utf-8',
  json: 'application/json; charset=utf-8',
  // text/plain so browsers show YAML and Markdown instead of downloading them
  // (they download application/yaml and text/markdown); clients parse the body either way.
  yaml: 'text/plain; charset=utf-8',
  markdown: 'text/plain; charset=utf-8',
  text: 'text/plain; charset=utf-8',
  raw: 'application/json; charset=utf-8',
});

// raw: the stored rows (scripture_verses), one per version per verse the version has, by
// version then verse. The text keeps every stored marker (¶ § / _ ▼ ► ◄ …), and format, p and
// s are the stored columns. Needs a passage built with stored: true (verse.stored).
function rawRows(data) {
  const verses = data.passages.flatMap(p => p.verses);
  return data.versions.flatMap(t => verses.filter(v => v.stored?.[t.id] != null).map(v => {
    const row = v.stored[t.id];
    return { id: v.id, version: t.id, book: v.book, chapter: v.chapter, verse: v.verse, format: row.format, p: row.p, s: row.s, text: row.text };
  }));
}

// Plain text of a list of pieces: struck text is left out (as plainText leaves it out), spaces
// collapsed
const plainPieces = pieces => pieces.flatMap(p => p.runs).filter(r => r.mark !== 'strike')
  .map(r => r.text).join('').replace(/\s+/g, ' ').trim();

// A block's lines of text: [{ indent, text }]
const blockLines = block => (block.lines
  ? block.lines.map(l => ({ indent: l.indent, text: plainPieces(l.pieces) }))
  : [{ indent: block.indent ?? 0, text: plainPieces(block.pieces) }]);

// Blocks as text: a blank line between blocks, a line break between lines, two spaces per
// indent. A linebreak paragraph (a "/" in prose) goes on the next line, not after a blank one.
// lineOf turns { indent, text } into the line's string.
function joinBlocks(blocks, lineOf, breaks) {
  let out = '';
  for (const block of blocks) {
    const lines = blockLines(block).filter(l => l.text).map(lineOf);
    if (!lines.length) continue;
    if (out) out += block.style === 'linebreak' ? breaks.line : breaks.block;
    out += lines.join(breaks.line);
  }
  return out;
}

const textOf = blocks => joinBlocks(blocks, l => '  '.repeat(l.indent) + l.text, { line: '\n', block: '\n\n' });

function forVersion(data, t) {
  const verses = data.passages.flatMap(p => p.verses ?? [])
    .filter(v => v.texts?.[t.id] != null)
    .map(v => ({ chapter: v.chapter, verse: v.verse, text: v.texts[t.id] }));
  const blocks = data.passages.flatMap(p => p.blocks?.[t.id] ?? []);
  return {
    reference: data.reference.map(r => r.label).join('; '),
    version: t.id,
    text: textOf(blocks),
    verses,
    copyright: t.copyright,
    blocks,
  };
}

// Markdown for one run: em, strong, strike and sup; small caps, small and sans stay plain.
// Spaces at the run's ends stay outside the delimiters.
const MD_MARKS = Object.freeze({ em: ['*', '*'], strong: ['**', '**'], strike: ['~~', '~~'], sup: ['<sup>', '</sup>'] });
function runMarkdown(run) {
  const [open, close] = MD_MARKS[run.mark] ?? ['', ''];
  if (!open) return run.text;
  const [, lead, body, trail] = run.text.match(/^(\s*)(.*?)(\s*)$/s);
  return body ? `${lead}${open}${body}${close}${trail}` : run.text;
}
// A verse number in Markdown, bold. A number that starts a new chapter inside a block carries
// the chapter ("**6:1**").
const verseNumber = (piece, chapter) => `**${chapter ? `${chapter}:` : ''}${piece.verse}**`;

// The verses a reference entry covers, by book, chapter and verse (a range may cross books)
function inReference(r, v) {
  if (!r.start || !r.end) return true;
  const at = (a, b) => (a.chapter - b.chapter) || (a.verse - b.verse);
  if (r.start.book === r.end.book) return v.book === r.start.book && at(v, r.start) >= 0 && at(v, r.end) <= 0;
  if (v.book === r.start.book) return at(v, r.start) >= 0;
  if (v.book === r.end.book) return at(v, r.end) <= 0;
  return true;
}

// Markdown for one version: the reference and version as the title, a "##" per chapter when
// there are several, section headings, then a paragraph per block with bold verse numbers.
// Poetry and line-break paragraphs keep their lines with Markdown hard breaks (two spaces at
// the line end); indents are em spaces (U+2003), which Markdown keeps and plain text shows.
// The title names only the references the version has text for.
function markdownFor(data, t) {
  const verses = data.passages.flatMap(p => p.verses ?? []).filter(v => v.texts?.[t.id] != null);
  const byId = new Map(verses.map(v => [v.id, v]));
  const chapterOf = v => `${v.book} ${v.chapter}`;
  const several = new Set(verses.map(chapterOf)).size > 1;
  const label = data.reference.filter(r => verses.some(v => inReference(r, v))).map(r => r.label).join('; ');
  const out = [`# ${label || data.reference.map(r => r.label).join('; ')} (${t.id})`];
  let chapter = null;
  let heading = null;

  // A list of pieces as one line of Markdown, with a verse number where a verse starts
  const line = pieces => pieces.map(p => {
    const v = byId.get(p.id);
    let num = '';
    if (p.start && p.verse != null) {
      const key = v ? chapterOf(v) : chapter;
      num = ` ${verseNumber(p, several && chapter !== null && key !== chapter ? v?.chapter : null)} `;
      if (key !== chapter) chapter = key;
    }
    return num + p.runs.map(runMarkdown).join('');
  }).join('').replace(/\s+/g, ' ').trim();

  for (const passage of data.passages) {
    const blocks = passage.blocks?.[t.id] ?? [];
    if (!blocks.length) continue;
    const h = passage.headings?.[t.id];
    let headingDue = h && h !== heading;
    for (const block of blocks) {
      const pieces = block.lines ? block.lines.flatMap(l => l.pieces) : block.pieces;
      const first = byId.get(pieces?.find(p => byId.has(p.id))?.id);
      // A chapter heading where the block starts a new chapter, then the section heading (once:
      // a section that runs on into the next chapter is not named again)
      if (several && first && chapterOf(first) !== chapter && pieces[0]?.start !== false) {
        chapter = chapterOf(first);
        out.push(`## ${chapter}`);
      }
      if (headingDue) {
        out.push(`${several ? '###' : '##'} ${h}`);
        heading = h;
        headingDue = false;
      }
      const indent = n => '\u2003\u2003'.repeat(n ?? 0);
      let text;
      if (block.type === 'subtitle') {
        const num = pieces.find(p => p.start && p.verse != null);
        const words = line(pieces.map(p => ({ ...p, start: false })));
        if (!words) continue;
        text = `${num ? `${verseNumber(num)} ` : ''}*${words}*`;
      } else if (block.lines) {
        const lines = block.lines.map(l => ({ indent: l.indent, text: line(l.pieces) })).filter(l => l.text);
        if (!lines.length) continue;
        text = lines.map(l => indent(l.indent) + l.text).join('  \n');
      } else {
        const words = line(block.pieces);
        if (!words) continue;
        text = indent((block.indent ?? 0) + (block.style === 'indent' ? 1 : 0)) + words;
      }
      // A line-break paragraph ("/" in prose) and a no-gap one go on the next line of the one before
      if ((block.style === 'linebreak' || block.style === 'nogap') && out.length > 1 && !out.at(-1).startsWith('#')) {
        out[out.length - 1] += `  \n${text}`;
      } else {
        out.push(text);
      }
    }
  }
  return out.join('\n\n') + '\n';
}

// One object for one version, a list for several (the blocks are kept back for markdown)
export function simpleData(data) {
  const all = data.versions.map(t => forVersion(data, t)).map(({ blocks, ...rest }) => rest);
  return all.length === 1 ? all[0] : all;
}

// json and yaml keep a version with no verses (text '', verses []); markdown and text leave
// it out. The builder throws when no version has any of the verses.
// Markdown does not escape verse text: inline characters such as * or [ ] are left as they are.
export function renderSimple(kind, data) {
  const blocks = data.versions.map(t => forVersion(data, t)).filter(b => b.verses.length);
  const named = data.versions.length > 1;
  switch (kind) {
    case 'json': return JSON.stringify(simpleData(data));
    case 'yaml': return dumpYaml(simpleData(data));
    case 'raw': return JSON.stringify(rawRows(data));
    case 'markdown':
      return data.versions.filter(t => blocks.some(b => b.version === t.id)).map(t => markdownFor(data, t)).join('\n');
    case 'text':
      return blocks.map(b => `${named ? `${b.version}: ` : ''}${b.text}\n`).join('\n');
    default: throw new Error(`unknown simple format ${kind}`);
  }
}

export function renderError(kind, err) {
  const error = err.toJSON();
  switch (kind) {
    case 'api': return JSON.stringify({ api: 'v1', error });
    case 'json':
    case 'raw': return JSON.stringify({ error });
    case 'yaml': return dumpYaml({ error });
    default: return `${err.message}\n`;
  }
}

// What a simple host's root (/) answers: how to use it, in its own format. host is the
// subdomain the request came in on (txt or plain, md or markdown, ...).
export function renderUsage(kind, host) {
  const usage = `https://${host}.scripture.guide/<version>/<reference>`;
  const example = `https://${host}.scripture.guide/nrsv/john3.16`;
  switch (kind) {
    case 'json':
    case 'raw': return JSON.stringify({ usage, example });
    case 'yaml': return dumpYaml({ usage, example });
    case 'markdown': return `Usage: \`${usage}\`, e.g. <${example}>\n`;
    case 'text': return `Usage: ${usage}, e.g. ${example}\n`;
    default: throw new Error(`unknown simple format ${kind}`);
  }
}
