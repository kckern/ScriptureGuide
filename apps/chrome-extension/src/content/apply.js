// Applies parse results to a text node, unless the page changed it while the text was being
// parsed. Returns false for a stale node so the caller can parse it again.

import { shiftMatches } from './chunker.js';
import { annotateTextNode } from './annotate.js';

export function applyResult(node, text, chunks, results, processed) {
  if (!node.isConnected || node.nodeValue !== text) return false;
  const matches = shiftMatches(chunks, results);
  if (matches.length) annotateTextNode(node, matches, processed);
  return true;
}
