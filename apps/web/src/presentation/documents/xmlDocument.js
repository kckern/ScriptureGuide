// xml.scripture.guide. The PHP inc_xml.php failed with a fatal error on the live site; this
// follows what its renderXML/renderXMLElement code meant to produce:
//   - <scripture> around the PHP wrappers <div class='scriptures'>, <div class='section'>,
//     <div class='passage ver_X'> (sections separated by <hr class='sectionbreak'/>)
//   - each element named after its class attribute, spaces → "_"; verse spans become
//     verse_prose | verse_poetry | verse_indent; h2 becomes <title>
//   - only the verse_label attribute is kept
//   - inline marks: {} → <small>, 〔〕 → <em>, 「」 → <strong>, ｟｠ → <span class="smallcaps">,
//     《》 → <sup>, ~~ → <s>, || → <span class='breaker'></span>
// Text is escaped so the document is well-formed. Inline formatting the HTML page already
// produced (<small>, <em>, <span class="smallcaps"> …) is passed through unchanged.

const INLINE = new Set(['small', 'em', 'strong', 'sup', 'sub', 's', 'i', 'b', 'u']);
const INLINE_SPAN_CLASSES = new Set(['smallcaps', 'sansserif', 'breaker']);
const BLOCK = new Set(['h2', 'h3', 'p', 'blockquote', 'div']);

const escText = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = s => escText(s).replace(/"/g, '&quot;');

// A valid XML name from a class-derived string.
function xmlName(s) {
  let n = String(s).replace(/[^\p{L}\p{N}_.-]/gu, '_');
  if (!/^[\p{L}_]/u.test(n)) n = '_' + n;
  return n;
}

export function elementName(node) {
  const cls = node.attr?.class;
  let el = node.el;
  if (cls) {
    el = cls.trim().replace(/\s+/g, ' ').replace(/ /g, '_');
    if (/^verse/.test(el)) {
      if (/prose/.test(cls)) el = 'verse_prose';
      if (/poetry/.test(cls)) el = 'verse_poetry';
      if (/indent/.test(cls)) el = 'verse_indent';
    }
  }
  if (node.el === 'h2') el = 'title';
  return xmlName(el);
}

function isInline(node) {
  if (INLINE.has(node.el)) return true;
  if (node.el === 'span') {
    const cls = String(node.attr?.class ?? '').trim();
    return INLINE_SPAN_CLASSES.has(cls);
  }
  return false;
}

// Inline marks in text → markup. Applied to escaped text, so the inserted tags survive.
export function inlineMarks(s) {
  return s
    .replace(/\|\|/g, "<span class='breaker'></span>")
    .replace(/\{(.*?)\}/g, '<small>$1</small>')
    .replace(/〔(.*?)〕/gu, '<em>$1</em>')
    .replace(/「(.*?)」/gu, '<strong>$1</strong>')
    .replace(/｟(.*?)｠/gu, '<span class="smallcaps">$1</span>')
    .replace(/《(.*?)》/gu, '<sup>$1</sup>')
    .replace(/~~(.*?)~~/g, '<s>$1</s>');
}

function renderNode(node, parent, index) {
  if (typeof node === 'string') {
    if (!node.trim()) return '';
    let t = node.replace(/\s+/g, ' ');
    if (parent && BLOCK.has(parent.el)) {
      const siblings = parent.content;
      const firstText = siblings.findIndex(c => typeof c !== 'string' || c.trim()) === index;
      const lastText = siblings.length - 1 - [...siblings].reverse().findIndex(c => typeof c !== 'string' || c.trim()) === index;
      if (firstText) t = t.trimStart();
      if (lastText) t = t.trimEnd();
    }
    return inlineMarks(escText(t));
  }
  const inner = node.content.map((c, i) => renderNode(c, node, i)).join('');
  if (isInline(node)) {
    const cls = node.el === 'span' && node.attr?.class ? ` class="${escAttr(node.attr.class.trim())}"` : '';
    return `<${node.el}${cls}>${inner}</${node.el}>`;
  }
  const name = elementName(node);
  const label = node.el !== 'h2' && node.attr?.verse_label ? ` verse_label="${escAttr(node.attr.verse_label)}"` : '';
  return `<${name}${label}>${inner}</${name}>`;
}

export function renderXml(sections) {
  let xml = "\n<div class='scriptures'>";
  sections.forEach((section, s) => {
    if (s > 0) xml += "\n\t<hr class='sectionbreak'/>";
    xml += "\n\t<div class='section'>";
    for (const passage of section.passages) {
      xml += `\n\t\t<div class='passage ver_${escAttr(passage.version || '')}'>`;
      xml += passage.content.map((c, i) => renderNode(c, null, i)).join('');
      xml += '\n\t\t</div>';
    }
    xml += '\n\t</div>';
  });
  xml += '\n</div>';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<scripture>${xml.trim()}</scripture>\n`;
}

export default renderXml;
