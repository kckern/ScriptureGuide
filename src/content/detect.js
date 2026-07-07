// DOM-safe candidate collection: find text nodes worth running the parser on,
// skipping editable/code/script contexts and already-linked/processed nodes.

const SKIP_SELECTOR = 'script,style,noscript,textarea,code,pre,a,svg,select,button,input,' +
  '[contenteditable]:not([contenteditable="false"]),.sg_autolink';

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
  return !!parent && !parent.closest(SKIP_SELECTOR);
}

// Walk `root` and collect all candidate text nodes (in document order).
export function collectCandidates(root, processed) {
  const doc = root.ownerDocument || document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!looksLikeCandidateText(node.nodeValue)) return NodeFilter.FILTER_REJECT;
      if (processed && processed.has(node)) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || parent.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const out = [];
  let n;
  while ((n = walker.nextNode())) out.push(n);
  return out;
}
