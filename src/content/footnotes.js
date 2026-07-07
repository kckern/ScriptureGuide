// Existing <a> links whose text is a scripture reference (e.g. footnote links
// on scriptures.byu.edu) are left intact; we append a small 🔗 that opens the
// reference on scripture.guide. This avoids nesting anchors or hijacking the
// page's own links.

import { refToSlug } from '../shared/slug.js';

const MARK = 'data-sg-reflinked';

// Anchors worth checking: have a digit and a letter (cheap pre-filter), aren't
// our own elements, aren't already handled, and are short enough to be a
// reference rather than a paragraph.
export function collectAnchorCandidates(root) {
  return [...root.querySelectorAll('a')].filter((a) => {
    if (a.classList.contains('sg_autolink') || a.classList.contains('sg_reflink')) return false;
    if (a.hasAttribute(MARK)) return false;
    const t = a.textContent;
    return !!t && t.length <= 60 && /\d/.test(t) && /[A-Za-z]/.test(t);
  });
}

// Given an anchor and the references detected in its text, append one 🔗 that
// links to scripture.guide for all of them. Returns the created element (or
// null if there was nothing to link).
export function annotateAnchor(anchor, matches) {
  if (anchor.hasAttribute(MARK)) return null;
  anchor.setAttribute(MARK, 'true');
  if (!matches || !matches.length) return null;

  const ref = matches.map((m) => m.ref).join('; ');
  const doc = anchor.ownerDocument;
  const link = doc.createElement('a');
  link.className = 'sg_reflink';
  link.setAttribute('href', 'https://scripture.guide/' + refToSlug(ref));
  link.setAttribute('target', '_blank');
  link.setAttribute('rel', 'noopener noreferrer');
  link.setAttribute('title', 'Open ' + ref + ' in Scripture Guide');
  link.setAttribute('aria-label', 'Open ' + ref + ' in Scripture Guide');
  link.textContent = '🔗'; // 🔗
  anchor.insertAdjacentElement('afterend', link);
  return link;
}

export function removeAllReflinks(root) {
  for (const el of [...root.querySelectorAll('a.sg_reflink')]) el.remove();
  for (const a of [...root.querySelectorAll('[' + MARK + ']')]) a.removeAttribute(MARK);
}
