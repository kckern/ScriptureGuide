// markdown.scripture.guide. The PHP inc_markdown.php failed with a fatal error on the live
// site; this follows what its renderMarkdown/renderMarkdownElement code meant to produce:
//   - a blank line before each h2, h3, div, p and blockquote
//   - a line break before spans with the linebreak class
//   - poetry lines indented 4 spaces, indented poetry lines 5 more
//   - text flattened to plain text; ellipses and verse_head blocks left out
// Choices of this port:
//   - headings are Markdown headings: h2 (book title) "# ", h3 (section or reference) "## "
//   - runs of blank lines collapse to one, trailing spaces are trimmed, output is trimmed
//   - the PHP flattenText dropped every character outside Latin, Hangul and ASCII; here only
//     the scripture markup characters are removed, so other scripts survive

const BLOCK = new Set(['h2', 'h3', 'div', 'p', 'blockquote']);
const SKIP_CLASSES = ['ellipses', 'verse_head'];

// Plain text of one text node (PHP scriptutil::flattenText, minus its character whitelist).
export function flattenText(text) {
  return String(text ?? '')
    .replace(/\n/g, '')
    .replace(/<br\/?>/g, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/｢\d+｣/gu, '')
    .replace(/~~(.*?)~~/g, '')
    .replace(/[｟｠「」〔〕《》⦅⦆{}§¶▫◄►▼▲_]/gu, '')
    .replace(/[| /]+/g, ' ')
    .replace(/([가-힣])\d+/gu, '$1')
    .replace(/([a-z])([.,;])([a-z])/giu, '$1$2 $3');
}

const INLINE = new Set(['small', 'em', 'strong', 'sup', 'sub', 's', 'i', 'b', 'u', 'a']);
const isInline = n => typeof n === 'string' || INLINE.has(n.el) ||
  (n.el === 'span' && !/\bverse\b/.test(String(n.attr?.class ?? '')) && n.content.every(isInline));

function textOf(node) {
  if (typeof node === 'string') return node;
  return node.content.map(textOf).join('');
}

function pushText(text, out) {
  const t = flattenText(text.replace(/\s+/g, ' ')).trim();
  if (t) out.push(t + ' ');
}

function walk(node, out) {
  if (typeof node === 'string') return pushText(node, out);
  const cls = String(node.attr?.class ?? '');
  if (node.el === 'h2' || node.el === 'h3') {
    const t = flattenText(textOf(node).replace(/\s+/g, ' ')).trim();
    if (t) out.push(`\n\n${node.el === 'h2' ? '#' : '##'} ${t}\n\n`);
    return;
  }
  if (BLOCK.has(node.el)) out.push('\n\n');
  if (/linebreak/i.test(cls)) out.push('\n');
  if (/poetry/i.test(cls) && node.el === 'span') out.push('    ');
  if (/indent/i.test(cls) && /poetry/i.test(cls)) out.push('     ');
  if (SKIP_CLASSES.includes(cls.trim())) return;
  // A verse (or any element holding only inline markup) is one run of text.
  if (node.content.every(isInline)) return pushText(textOf(node), out);
  for (const c of node.content) walk(c, out);
}

export function renderMarkdown(sections) {
  const out = [];
  sections.forEach((section, s) => {
    if (s > 0) out.push('\n\n');
    for (const passage of section.passages) for (const c of passage.content) walk(c, out);
  });
  return out.join('')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}

export default renderMarkdown;
