// Long text nodes are parsed in pieces so no single parser call can block for long.
// Pieces end after a sentence where possible (detection binds context within a sentence),
// else after a space, else at the limit. Offsets let matches map back onto the node.

export const MAX_CHUNK_CHARS = 2000;

export function chunkText(text, max = MAX_CHUNK_CHARS) {
  const chunks = [];
  let offset = 0;
  while (offset < text.length) {
    if (text.length - offset <= max) {
      chunks.push({ offset, text: text.slice(offset) });
      break;
    }
    const window = text.slice(offset, offset + max);
    let cut = -1;
    const sentenceEnd = /[.!?]["')\]]*\s+/g;
    let m;
    while ((m = sentenceEnd.exec(window)) !== null) cut = m.index + m[0].length;
    if (cut <= 0) cut = window.lastIndexOf(' ') + 1;
    if (cut <= 0) cut = max;
    chunks.push({ offset, text: text.slice(offset, offset + cut) });
    offset += cut;
  }
  return chunks;
}

// Matches found per chunk, moved to offsets within the whole node.
export function shiftMatches(chunks, results) {
  const out = [];
  chunks.forEach((chunk, i) => {
    for (const m of results[i] || []) out.push({ ...m, start: m.start + chunk.offset, end: m.end + chunk.offset });
  });
  return out;
}
