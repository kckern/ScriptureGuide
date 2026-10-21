// Text helpers ported from the PHP site's scriptutil.php.inc, scriptures.php.inc and versebox.php.
// They reproduce the PHP output exactly; comments name the PHP function each one mirrors.

// Characters flattenText keeps: ASCII printable, Latin accents, Hangul, curly quotes, dashes, newline.
const FLATTEN_DROP = /[^a-z0-9가-힣àèìòùÀÈÌÒÙáéíóúýÁÉÍÓÚÝâêîôûÂÊÎÔÛãñõÃÑÕäëïöüÿÄËÏÖÜŸçÇßØøÅåÆæœ ‘’“”–—−‐!-~\n]|_/gu;

// PHP strip_tags for the simple markup stored in verse text: "<" followed by whitespace is not a tag.
export function stripTags(text) {
  return String(text).replace(/<[^\s>][^>]*>/g, '');
}

// scriptutil::flattenText — strip markup and scripture markers down to plain words.
export function flattenText(text) {
  let t = String(text ?? '').replace(/\n/g, '');
  t = stripTags(t.replace(/<br\/>/g, '\n'));
  t = t.replace(/｢\d+｣/gu, '');
  t = t.replace(FLATTEN_DROP, '');
  t = t.replace(/~~(.*?)~~/g, '');
  t = t.replace(/([| /])+/g, ' ');
  // PHP ran /([가-힣])\d+/ without the u flag, so it matched the last byte of any
  // multibyte character: digits after any non-ASCII character are dropped ("—200" → "—").
  t = t.replace(/([^\x00-\x7f])\d+/gu, '$1');
  t = t.replace(/([a-z])([.,;])([a-z])/gi, '$1$2 $3');
  return t;
}

// scriptures::formattedData splits a verse into lines at paragraph/section markers and "/" line
// breaks; each non-empty line becomes one span. A line of exactly "*" folds the verse into the
// previous one (a gap verse).
const LINE_SPLIT = /(?:[§‾▲]*¶[▲▼◤►◄↪]*|\/|\\)/u;

export function splitVerseLines(text) {
  return String(text ?? '').split(LINE_SPLIT).filter(line => line !== '' && line !== '0');
}

// renderArray (output=array, the parallel view): each line's flattened text after a space.
export function arrayText(text) {
  return splitVerseLines(text).filter(l => l !== '*').map(l => ' ' + flattenText(l)).join('');
}

// renderTextElement for one span: flattened content plus a space, whitespace collapsed.
export function plainLine(line) {
  return (flattenText(line) + ' ').replace(/\s+/g, ' ');
}

// renderText for one passage (one meta block, plain.scripture.guide): verses in order, "*" gap
// lines skipped, each line collapsed on its own.
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

// renderText for one verse as the search page shows it: whitespace collapsed across lines, trimmed.
export function plainText(text) {
  let out = '';
  for (const line of splitVerseLines(text)) {
    if (line === '*') continue;
    out = (out + flattenText(line) + ' ').replace(/\s+/g, ' ');
  }
  return out.trim();
}

// versebox.php stemText/callb — wrap each word in <span stem='…'> for the client-side diff.
export function stemText(text) {
  return String(text).replace(/[a-z]+/gi, word => {
    let stem = word.toLowerCase().replace(/[^a-z]+/g, '');
    if (stem.length > 5) stem = stem.slice(0, -4);
    return `<span stem='${stem}'>${word}</span>`;
  });
}

// scriptutil::transposeRef — "Mark 5" read as JST becomes "JST Mark 5", and the reverse.
export function transposeRef(ref, ver) {
  const r = ref == null ? '' : String(ref);
  if (ver === 'JST' && !/jst/i.test(r)) return `JST ${r}`;
  if (ver !== 'JST' && /jst/i.test(r)) return r.replace(/jst/gi, '');
  return r;
}

// scriptutil::renderHeadingHTML — heading text: "/" is a line break, subscript digits ₁–₄ are <sub>.
export function renderHeadingHtml(text) {
  return String(text ?? '')
    .replace(/\//g, '<br/>')
    .replace(/[\u2081-\u2084]/g, c => `<sub>${c.charCodeAt(0) - 0x2080}</sub>`);
}

// Heading fields scriptutil::buildHeading passes through renderHeadingHTML.
export const RENDERED_HEADING_FIELDS = Object.freeze([
  'pretitle', 'title', 'timeframe', 'subtitle', 'part_title', 'part_subtitle', 'book_title', 'book_subtitle',
  'section_title', 'section_subtitle', 'headnote_heading', 'heading', 'subheading', 'section_footer', 'verse_head',
]);

// A heading record { type: text, ... } with those fields rendered; other fields are kept.
export function renderHeadingFields(record) {
  if (!record) return record;
  const out = { ...record };
  for (const f of RENDERED_HEADING_FIELDS) if (typeof out[f] === 'string') out[f] = renderHeadingHtml(out[f]);
  return out;
}

// scriptures::formattedData: the format and paragraph class of each segment of a verse, from the
// verse's own format and the marker before each segment. A marker's format holds for the rest of
// the verse: ¶▼ poetry, ¶↪ indent, ¶► prose; ¶◄ starts a "flush" paragraph, ¶◤ a "linebreak"
// one and ‾¶ a "nogap" one (both prose). A line starting with § (a subtitle) is prose.
// segments: [{ meta, text }] from VerseSerializer.splitSegments.
export function segmentFormats(verseFormat, segments) {
  let format = verseFormat || 'prose';
  return segments.map(({ meta, text }) => {
    let paraClass = '';
    if (meta === '¶◄' || meta === '§¶◄') { paraClass = 'flush'; }
    else if (meta === '¶▼') format = 'poetry';
    else if (meta === '¶↪') format = 'indent';
    else if (meta === '¶►') format = 'prose';
    else if (meta === '¶◤') { format = 'prose'; paraClass = 'linebreak'; }
    else if (meta === '‾¶') { format = 'prose'; paraClass = 'nogap'; }
    else if (meta === '¶▼◄') paraClass = 'flush';
    return { format: String(text).startsWith('§') ? 'prose' : format, paraClass };
  });
}

// Strip a "*FMT" suffix: "NIV*KJV" → "NIV".
export function baseVersion(ver) {
  return String(ver ?? '').replace(/\*.*$/, '');
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// passage_script.php searchterm highlighting. PHP ran the term as a raw regex over the whole
// HTML, attributes included; here the term is escaped and only text between tags is touched.
export function highlightSearchTerm(html, term) {
  if (!term || !String(term).trim()) return html;
  const pattern = String(term)
    .trim()
    .split(/\s+/)
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\W+');
  const re = new RegExp(`\\b${pattern}\\b`, 'giu');
  return html.replace(/(^|>)([^<]+)/g, (m, open, text) =>
    open + text.replace(re, match => `<span class='searchterm'>${match}</span>`));
}
