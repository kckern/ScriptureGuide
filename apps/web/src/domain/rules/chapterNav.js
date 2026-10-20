// Chapter navigation below a passage (scriptures::renderChapterNav in the PHP site).

// scriptutil::slufigyRef: "Gen. 1:1–5" → "gen.1.1-5"
export function slugifyRef(ref) {
  return String(ref || '')
    .toLowerCase()
    .replace(/[\s.:]+/g, '.')
    .replace(/([;,])\./g, '$1')
    .replace(/–/g, '-');
}

// Chapter nav is shown only for a single block whose reference names no verses.
export function wantsChapterNav(normalizedRef) {
  return !!normalizedRef && !/[,;:]/.test(normalizedRef);
}

/**
 * @param {object} rows  verse-index rows { volume_id, book_title, book_title_short, chapter }
 *   current: first verse of the passage; prev: verse before it; next: verse after the passage
 * @param {string|null} rows.versionSpec  the version segment as typed in the URL, if any
 */
export function chapterNavLinks({ current, prev, next, versionSpec = null }) {
  const base = versionSpec ? `/${versionSpec}` : '';
  const link = row => (row && current && row.volume_id === current.volume_id)
    ? { href: `${base}/${slugifyRef(`${row.book_title_short} ${row.chapter}`)}`, label: `${row.book_title} ${row.chapter}` }
    : null;
  return { prev: link(prev), next: link(next) };
}
