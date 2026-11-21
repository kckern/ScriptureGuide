// Character offsets of the <span class='searchterm'> marks that SearchService's highlighter puts
// in plain verse text, as [start, end] pairs into the text without the marks.
const OPEN = "<span class='searchterm'>";
const CLOSE = '</span>';

export function highlightOffsets(marked) {
  const out = [];
  let plain = 0;
  let i = 0;
  while (i < marked.length) {
    if (marked.startsWith(OPEN, i)) {
      const end = marked.indexOf(CLOSE, i + OPEN.length);
      if (end === -1) break; // an unclosed mark: nothing after it can be placed
      const length = end - (i + OPEN.length);
      if (length > 0) out.push([plain, plain + length]);
      plain += length;
      i = end + CLOSE.length;
    } else {
      plain++;
      i++;
    }
  }
  return out;
}
