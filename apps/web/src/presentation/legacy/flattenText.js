// Plain-text rendering of verse markup, ported from the PHP site:
// scriptutil::flattenText, the line split in scriptures::formattedData, and renderText.

// Characters flattenText keeps (everything else, and "_", is dropped).
const DISALLOWED = /[^a-z0-9가-힣àèìòùÀÈÌÒÙáéíóúýÁÉÍÓÚÝâêîôûÂÊÎÔÛãñõÃÑÕäëïöüÿÄËÏÖÜŸçÇßØøÅåÆæœ ‘’“”–—−‐!-~\n]|_/gu;

export function stripTags(text) {
  return text.replace(/<[^\s>][^>]*>/g, '');
}

export function flattenText(text) {
  let t = String(text ?? '').replace(/\n/g, '');
  t = stripTags(t.replace(/<br\/>/g, '\n'));
  t = t.replace(/｢\d+｣/gu, '');
  t = t.replace(DISALLOWED, '');
  t = t.replace(/~~(.*?)~~/g, '');
  t = t.replace(/([| /])+/g, ' ');
  // PHP ran /([가-힣])\d+/ without the u flag, so it matched the last byte of any
  // multibyte character: digits after any non-ASCII character are dropped.
  t = t.replace(/([^\x00-\x7f])\d+/gu, '$1');
  t = t.replace(/([a-z])([.,;])([a-z])/gi, '$1$2 $3');
  return t;
}

// formattedData splits each verse on paragraph/section meta and line breaks.
const LINE_SPLIT = /(?:[§‾▲]*¶[▲▼◤►◄↪]*|\/|\\)/u;

export function splitVerseLines(text) {
  return String(text ?? '').split(LINE_SPLIT).filter(line => line !== '' && line !== '0');
}

// renderTextElement for one span: flattened content plus a space, whitespace collapsed.
function plainLine(line) {
  return (flattenText(line) + ' ').replace(/\s+/g, ' ');
}

// renderText for one passage (one meta block): verses in order, "*" gap lines skipped.
export function plainPassage(verses) {
  let text = '';
  for (const v of verses) {
    for (const line of splitVerseLines(v.text)) {
      if (line === '*') continue;
      text += plainLine(line);
    }
  }
  return text;
}

// renderText: passages separated by a blank line, whole result trimmed.
export function plainText(passages) {
  return passages.map(p => plainPassage(p)).join('\n\n').trim();
}

export default flattenText;
