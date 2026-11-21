// The HTML fragment for one passage in one version (the "html" option), rendered from its blocks
// (blocks.js): semantic classes and data attributes only, no layout markup.
//   <p class="subtitle">, <p class="paragraph [style] [indent-N]">,
//   <div class="poetry|sense [style]"> with <span class="line [indent-N]"> per line,
//   marks as <span class="smallcaps">, <small>, <em>, <strong>, <sup>, <s>, <span class="sans">,
//   and <span class="verse-num" data-verse data-verse-id> where a verse starts.
import { escapeHtml } from '../../domain/rules/legacyText.js';

const MARK_TAGS = Object.freeze({
  smallcaps: ['<span class="smallcaps">', '</span>'],
  small: ['<small>', '</small>'],
  em: ['<em>', '</em>'],
  strong: ['<strong>', '</strong>'],
  sup: ['<sup>', '</sup>'],
  strike: ['<s>', '</s>'],
  sans: ['<span class="sans">', '</span>'],
});

const runHtml = run => {
  const [open, close] = MARK_TAGS[run.mark] ?? ['', ''];
  return open + escapeHtml(run.text) + close;
};

// A piece's runs, with the verse number where the verse starts (after the space that joins it
// to the text before)
function piecesHtml(pieces) {
  return pieces.map(p => {
    if (!p.start) return p.runs.map(runHtml).join('');
    const runs = p.runs.map(r => ({ ...r }));
    const space = runs[0]?.text.startsWith(' ') ? ' ' : '';
    if (space) runs[0].text = runs[0].text.slice(1);
    const num = `<span class="verse-num" data-verse="${escapeHtml(p.verse ?? '')}" data-verse-id="${p.id}">${escapeHtml(p.verse ?? '')}</span>`;
    return space + num + runs.filter(r => r.text).map(runHtml).join('');
  }).join('');
}

const classes = (...names) => names.filter(Boolean).join(' ');
const indentClass = n => (n ? `indent-${n}` : null);

function blockHtml(block) {
  if (block.type === 'subtitle') return `<p class="subtitle">${piecesHtml(block.pieces)}</p>`;
  if (block.lines) {
    const lines = block.lines.map(l => `<span class="${classes('line', indentClass(l.indent))}">${piecesHtml(l.pieces)}</span>`);
    return `<div class="${classes(block.type, block.style)}">${lines.join('')}</div>`;
  }
  return `<p class="${classes('paragraph', block.style, indentClass(block.indent))}">${piecesHtml(block.pieces)}</p>`;
}

export function passageHtml(passage, version) {
  const heading = passage.headings?.[version];
  return `<div class="passage" data-version="${escapeHtml(version)}">` +
    (heading ? `<h3 class="heading">${escapeHtml(heading)}</h3>` : '') +
    (passage.blocks?.[version] ?? []).map(blockHtml).join('') +
    '</div>';
}
