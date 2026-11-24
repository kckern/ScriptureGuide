// DOM-safe candidate collection: find text nodes worth running the parser on,
// skipping editable/code/script contexts and already-linked/processed nodes.

// Anchors are handled separately (see insideShortAnchor). Product-title markup carries model names
// ("Gen2", "Rev 3.0"), not citations.
const SKIP_SELECTOR = 'script,style,noscript,textarea,code,pre,svg,select,button,input,title,' +
  '#productTitle,[data-component-type="s-title-instructions-style"],' +
  '[contenteditable]:not([contenteditable="false"]),.sg_autolink,.sg_reflink,.sg_origlink';

// Short anchors that read like a reference are the footnote path's job and must not be linked twice.
// A long anchor is a card or headline that merely contains a reference (Reddit wraps whole post
// titles and previews in one <a>), so its text is annotated with a non-anchor element.
const SHORT_ANCHOR_CHARS = 60;
function insideShortAnchor(parent) {
  const a = parent.closest('a');
  return !!a && (a.textContent || '').length <= SHORT_ANCHOR_CHARS;
}

// Cheap pre-filter applied before ever calling the parser: a real reference is
// at least ~6 chars and always contains a digit.
function looksLikeCandidateText(t) {
  return !!t && t.length >= 6 && /\d/.test(t);
}

// True when this text node should be handed to the parser.
export function isCandidate(node, processed) {
  if (!node || node.nodeType !== 3 /* TEXT_NODE */) return false;
  if (!looksLikeCandidateText(node.nodeValue)) return false;
  if (processed && processed.has(node)) return false;
  const parent = node.parentElement;
  return !!parent && !parent.closest(SKIP_SELECTOR) && !insideShortAnchor(parent);
}

// Walk `root` and collect all candidate text nodes (in document order).
export function collectCandidates(root, processed) {
  const doc = root.ownerDocument || document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!looksLikeCandidateText(node.nodeValue)) return NodeFilter.FILTER_REJECT;
      if (processed && processed.has(node)) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || parent.closest(SKIP_SELECTOR) || insideShortAnchor(parent)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const out = [];
  let n;
  while ((n = walker.nextNode())) out.push(n);
  return out;
}
