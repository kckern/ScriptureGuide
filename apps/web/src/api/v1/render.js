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
  yaml: 'application/yaml; charset=utf-8',
  markdown: 'text/markdown; charset=utf-8',
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
const markdownPieces = pieces => pieces.flatMap(p => p.runs).map(runMarkdown).join('').replace(/\s+/g, ' ').trim();

// One blockquote: a paragraph per block (a ">" line between them), poetry and line-break lines
// ending in a Markdown hard break, indented lines starting with an em space per indent
function markdownQuote(blocks) {
  let out = '';
  for (const block of blocks) {
    const lines = (block.lines ?? [{ indent: block.indent ?? 0, pieces: block.pieces }])
      .map(l => ({ indent: l.indent, text: markdownPieces(l.pieces) })).filter(l => l.text)
      .map(l => `> ${'&emsp;'.repeat(l.indent)}${l.text}`);
    if (!lines.length) continue;
    if (out) out += block.style === 'linebreak' ? '  \n' : '\n>\n';
    out += lines.join('  \n');
  }
  return out;
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
      return blocks.map(b => `${markdownQuote(b.blocks)}\n>\n> — ${b.reference} (${b.version})\n`).join('\n');
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
