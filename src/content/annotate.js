// Text-node splitting: replace a text node with a DocumentFragment where each
// detected reference span becomes an <a class="sg_autolink">, and the text
// between/around spans stays as plain text nodes. Never touches innerHTML, so
// sibling nodes, event listeners, and HTML-special characters are preserved.

import { refToSlug } from '../shared/slug.js';

// matches: [{ start, end, text, ref, verse_ids }] with offsets into
// textNode.nodeValue. `processed` (a WeakSet) records the plain text nodes we
// create so the scanner won't re-examine them.
export function annotateTextNode(textNode, matches, processed) {
  const parent = textNode.parentNode;
  if (!parent || !matches || !matches.length) return { links: [] };

  const doc = textNode.ownerDocument;
  const text = textNode.nodeValue;
  const frag = doc.createDocumentFragment();
  const links = [];
  let cursor = 0;

  const addText = (str) => {
    if (!str) return;
    const t = doc.createTextNode(str);
    if (processed) processed.add(t);
    frag.appendChild(t);
  };

  for (const m of matches) {
    if (m.start < cursor || m.end > text.length || m.end <= m.start) continue; // overlap/bounds guard
    addText(text.slice(cursor, m.start));
    const a = doc.createElement('a');
    a.className = 'sg_autolink';
    a.textContent = text.slice(m.start, m.end);
    a.setAttribute('href', 'https://scripture.guide/' + refToSlug(m.ref || a.textContent));
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
    frag.appendChild(a);
    links.push(a);
    cursor = m.end;
  }
  addText(text.slice(cursor));

  parent.replaceChild(frag, textNode);
  return { links };
}

// Undo all annotations under `root`, restoring plain text (used when a site is
// disabled live). Merges the resulting adjacent text nodes.
export function removeAllAnnotations(root) {
  const links = [...root.querySelectorAll('a.sg_autolink')];
  for (const a of links) {
    const parent = a.parentNode;
    if (!parent) continue;
    parent.replaceChild(a.ownerDocument.createTextNode(a.textContent), a);
    parent.normalize();
  }
}
