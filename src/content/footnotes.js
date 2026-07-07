// Existing <a> links whose text is a scripture reference (e.g. footnote links
// on scriptures.byu.edu) are left intact; we append a small 🔗 that opens the
// reference on scripture.guide. This avoids nesting anchors or hijacking the
// page's own links.

import { refToSlug } from '../shared/slug.js';

export const MARK = 'data-sg-reflinked';

// External-link glyph (svg/link.svg), inlined with currentColor so it inherits
// the link colour and adapts to light/dark. Sized via CSS (.sg_reflink svg).
const ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M10.0002 5H8.2002C7.08009 5 6.51962 5 6.0918 5.21799C5.71547 5.40973 5.40973 5.71547 ' +
  '5.21799 6.0918C5 6.51962 5 7.08009 5 8.2002V15.8002C5 16.9203 5 17.4801 5.21799 17.9079C5.40973 ' +
  '18.2842 5.71547 18.5905 6.0918 18.7822C6.5192 19 7.07899 19 8.19691 19H15.8031C16.921 19 17.48 19 ' +
  '17.9074 18.7822C18.2837 18.5905 18.5905 18.2839 18.7822 17.9076C19 17.4802 19 16.921 19 15.8031V14M20 ' +
  '9V4M20 4H15M20 4L13 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
  'stroke-linejoin="round"/></svg>';

// Build the icon element without innerHTML (Trusted-Types/CSP safe), falling
// back to a text glyph if SVG parsing is unavailable.
function makeIcon(doc) {
  try {
    const parsed = new DOMParser().parseFromString(ICON_SVG, 'image/svg+xml');
    const svg = parsed.documentElement;
    if (svg && svg.nodeName.toLowerCase() === 'svg' && !svg.querySelector('parsererror')) {
      return doc.importNode(svg, true);
    }
  } catch (e) { /* fall through */ }
  const span = doc.createElement('span');
  span.textContent = '🔗'; // 🔗
  return span;
}

// Is this an <a> worth checking: has a digit and a letter (cheap pre-filter),
// isn't one of our own elements, isn't already handled, and is short enough to
// be a reference rather than a paragraph.
export function isAnchorCandidate(a) {
  if (!a || a.tagName !== 'A') return false;
  if (a.classList.contains('sg_autolink') || a.classList.contains('sg_reflink')) return false;
  if (a.hasAttribute(MARK)) return false;
  const t = a.textContent;
  return !!t && t.length <= 60 && /\d/.test(t) && /[A-Za-z]/.test(t);
}

// Candidate anchors within `root`, including `root` itself when it is an anchor
// (querySelectorAll only returns descendants).
export function collectAnchorCandidates(root) {
  const out = isAnchorCandidate(root) ? [root] : [];
  for (const a of root.querySelectorAll('a')) if (isAnchorCandidate(a)) out.push(a);
  return out;
}

// True when anchor `b` follows anchor `a` with nothing between them but joiner
// text — ";", ",", "and", whitespace — so they read as one citation
// ("D&C 28:7; D&C 64:5"). Any element in the gap (or a different parent) breaks
// the run.
const JOINER_GAP = /^[\s;,]*(?:and\b[\s;,]*)?$/i;
function adjacentByJoiner(a, b) {
  let n = a.nextSibling;
  let gap = '';
  while (n && n !== b) {
    if (n.nodeType === 3) gap += n.nodeValue;
    else return false; // an element (not b) between -> not a plain run
    n = n.nextSibling;
  }
  if (n !== b) return false; // b is not a following sibling of a
  return JOINER_GAP.test(gap);
}

// Group candidate anchors into runs of back-to-back references separated only
// by joiners. Each run gets a single 🔗 (after its last anchor). Returns an
// array of arrays (singletons for lone references).
export function collectAnchorGroups(root) {
  const anchors = collectAnchorCandidates(root);
  const groups = [];
  let i = 0;
  while (i < anchors.length) {
    const group = [anchors[i]];
    while (i + 1 < anchors.length && adjacentByJoiner(anchors[i], anchors[i + 1])) {
      group.push(anchors[++i]);
    }
    groups.push(group);
    i++;
  }
  return groups;
}

// Given an anchor and the references detected in its text, append one 🔗 that
// links to scripture.guide for all of them. Returns the created element (or
// null if there was nothing to link).
export function annotateAnchor(anchor, matches) {
  if (!matches || !matches.length) return null;
  // Idempotence is based on an existing 🔗 sibling, NOT the MARK attribute:
  // the caller (processGroup) marks every anchor in a run before annotating the
  // last one, so a MARK check here would always bail and never append.
  const next = anchor.nextElementSibling;
  if (next && next.classList && next.classList.contains('sg_reflink')) return null;
  anchor.setAttribute(MARK, 'true');

  const ref = matches.map((m) => m.ref).join('; ');
  const doc = anchor.ownerDocument;
  const link = doc.createElement('a');
  link.className = 'sg_reflink';
  link.setAttribute('href', 'https://scripture.guide/' + refToSlug(ref));
  link.setAttribute('target', '_blank');
  link.setAttribute('rel', 'noopener noreferrer');
  link.setAttribute('title', 'Open ' + ref + ' in Scripture Guide');
  link.setAttribute('aria-label', 'Open ' + ref + ' in Scripture Guide');
  link.appendChild(makeIcon(anchor.ownerDocument));
  anchor.insertAdjacentElement('afterend', link);
  return link;
}

export function removeAllReflinks(root) {
  for (const el of [...root.querySelectorAll('a.sg_reflink')]) el.remove();
  for (const a of [...root.querySelectorAll('[' + MARK + ']')]) a.removeAttribute(MARK);
}
