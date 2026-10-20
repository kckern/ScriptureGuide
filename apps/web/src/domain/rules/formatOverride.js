// Version format override ("/kjv*niv/..." = KJV text in NIV paragraphing and line
// format), from scriptures::scriptureData and scriptutil::flattenText in the PHP site.

const KEEP = 'a-z0-9가-힣àèìòùÀÈÌÒÙáéíóúýÁÉÍÓÚÝâêîôûÂÊÎÔÛãñõÃÑÕäëïöüÿÄËÏÖÜŸçÇßØøÅåÆæœ ‘’“”––—−‐!-~\\n';
const STRIP = new RegExp(`[^${KEEP}]|_`, 'gu');

// Plain text without markup characters, tags or footnote markers
export function flattenText(text) {
  let t = String(text ?? '').replace(/\n/g, '');
  t = t.replace(/<br\/>/g, '\n').replace(/<[^>]*>/g, '');
  t = t.replace(/｢\d+｣/gu, '');
  t = t.replace(STRIP, '');
  t = t.replace(/~~(.*?)~~/g, '');
  t = t.replace(/([| /])+/g, ' ');
  t = t.replace(/([가-힣])\d+/gu, '$1');
  t = t.replace(/([a-z])([.,;])([a-z])/giu, '$1$2 $3');
  return t;
}

/**
 * Re-format text rows with the paragraphing/format of another version.
 * @param {Array} textRows    rows { verse_id, text, format, s, p } of the text version
 * @param {Array|'FLAT'} formatRows  rows { verse_id, format, p, s } of the format version, or 'FLAT'
 * @param {string} formatVersion     label for the mixmatch attribute (none for FLAT)
 * @returns the new rows, or textRows unchanged when the row counts differ
 */
export function applyFormatOverride(textRows, formatRows, formatVersion) {
  const flat = formatRows === 'FLAT';
  const fmt = flat
    ? textRows.map(r => ({ verse_id: r.verse_id, format: 'prose', p: '¶', s: '' }))
    : formatRows;
  if (!fmt || !fmt.length || fmt.length !== textRows.length) return textRows;

  let lastFormat;
  return textRows.map((row, i) => {
    const { format, s = '' } = fmt[i];
    let { p = '' } = fmt[i];
    if (lastFormat !== format) p = '¶';
    lastFormat = format;
    const linebreak = format === 'poetry' ? '/' : '';
    let text = flattenText(row.text);
    text = (s + p + linebreak + text.replace(/[_¶§]/gu, ''))
      .split('▼').join('')
      .split('►').join('')
      .split('¶/').join('¶')
      .split('/').join(` ${linebreak}`);
    if (format === 'poetry' || format === 'sense') {
      text = text.replace(/’/g, "'");
      text = text.replace(/(.{15,25})([,.;?!—:;][)”?]*)/gu, '$1$2/');
      text = text.replace(/\/\s*([a-z])/g, '/_ $1');
    }
    const out = { ...row, text, format, p, s };
    if (!flat) out.mixmatch = formatVersion;
    return out;
  });
}
