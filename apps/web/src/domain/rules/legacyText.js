// Text helpers ported from the PHP site's scriptutil.php.inc and versebox.php.
// They reproduce the PHP output exactly; comments name the PHP function each one mirrors.

// Characters flattenText keeps: ASCII printable, Latin accents, Hangul, curly quotes, dashes, newline.
const FLATTEN_DROP = /[^a-z0-9가-힣àèìòùÀÈÌÒÙáéíóúýÁÉÍÓÚÝâêîôûÂÊÎÔÛãñõÃÑÕäëïöüÿÄËÏÖÜŸçÇßØøÅåÆæœ ‘’“”––—−‐!-~\n]|_/gu;

// scriptutil::flattenText — strip markup and scripture markers down to plain words.
export function flattenText(text) {
  if (text == null) return '';
  let t = String(text).replace(/\n/g, '');
  t = stripTags(t.replace(/<br\/>/g, '\n'));
  t = t.replace(/｢\d+｣/gu, '');
  t = t.replace(FLATTEN_DROP, '');
  t = t.replace(/~~(.*?)~~/g, '');
  t = t.replace(/[| /]+/g, ' ');
  t = t.replace(/([가-힣])\d+/gu, '$1');
  t = t.replace(/([a-z])([.,;])([a-z])/giu, '$1$2 $3');
  return t;
}

// PHP strip_tags for the simple markup stored in verse text.
export function stripTags(html) {
  return String(html).replace(/<\/?[a-z!][^>]*>/gi, '');
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
