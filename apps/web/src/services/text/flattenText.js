// Plain-text rendering of stored verse text, as the PHP site produces it for output=array
// (renderArray, used by the parallel view) and plain lookups (used by search results).

// scriptutil::flattenText
export function flattenText(text) {
  let t = String(text ?? '').replace(/\n/g, '');
  t = t.replace(/<br\/>/g, '\n').replace(/<[^>]*>/g, '');
  t = t.replace(/｢\d+｣/gu, '');
  t = t.replace(/([^a-z0-9가-힣àèìòùÀÈÌÒÙáéíóúýÁÉÍÓÚÝâêîôûÂÊÎÔÛãñõÃÑÕäëïöüÿÄËÏÖÜŸçÇßØøÅåÆæœ ‘’“”––—−‐!-~\n]|[_])/gu, '');
  t = t.replace(/~~(.*?)~~/g, '');
  t = t.replace(/([| /])+/g, ' ');
  t = t.replace(/([가-힣])\d+/gu, '$1');
  t = t.replace(/([a-z])([.,;])([a-z])/giu, '$1$2 $3');
  return t;
}

// formattedData splits a verse into lines at paragraph/section markers and "/" line breaks;
// each non-empty line becomes one span. A line of exactly "*" folds the verse into the previous one.
const LINE_SPLIT = /(?:[§‾▲]*¶[▲▼◤►◄↪]*|\/|\\)/u;

export function verseLines(text) {
  return String(text ?? '').split(LINE_SPLIT).filter(line => line !== '' && line !== '0');
}

// renderArray: each line's flattened text appended after a space.
export function arrayText(text) {
  return verseLines(text).filter(l => l !== '*').map(l => ' ' + flattenText(l)).join('');
}

// renderText (plain): each line flattened plus a space, whitespace collapsed, trimmed.
export function plainText(text) {
  let out = '';
  for (const line of verseLines(text)) {
    if (line === '*') continue;
    out = (out + flattenText(line) + ' ').replace(/\s+/g, ' ');
  }
  return out.trim();
}

export const isCompoundMarker = text => verseLines(text).length > 0 && verseLines(text).every(l => l === '*');
