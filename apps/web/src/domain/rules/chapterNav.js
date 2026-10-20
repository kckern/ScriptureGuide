// Chapter navigation below a passage (scriptures::renderChapterNav in the PHP site).
import { slugifyRef } from './legacyReference.js';

// Chapter nav is shown only for a single block whose reference names no verses.
export function wantsChapterNav(normalizedRef) {
  return !!normalizedRef && !/[,;:]/.test(normalizedRef);
}

// Short reference of a consecutive section (scriptutil::referenceFromVerseIds with
// book_title_short): first/last are { chapter, verse }; lastChapterMax is the
// number of verses in the last chapter.
export function sectionRef(bookShort, first, last, lastChapterMax) {
  if (first.chapter === last.chapter) {
    if (first.verse === 1 && last.verse === lastChapterMax) return `${bookShort} ${first.chapter}`;
    if (first.verse === last.verse) return `${bookShort} ${first.chapter}:${first.verse}`;
    return `${bookShort} ${first.chapter}:${first.verse}–${last.verse}`;
  }
  const minv = first.verse === 1 ? '' : `:${first.verse}`;
  const maxv = last.verse === lastChapterMax && minv === '' ? '' : `:${last.verse}`;
  return `${bookShort} ${first.chapter}${minv}–${last.chapter}${maxv}`;
}

// scriptutil::renderHeadingHTML: "/" is a line break
const headingHtml = text => String(text || '').replace(/\//g, '<br/>');

/**
 * Section nav (scriptures::renderSectionNav), used when the passage is exactly one
 * heading section. prev/next: { ref, heading } of the neighbouring sections, or null.
 */
export function sectionNavLinks({ prev, next, versionSpec = null }) {
  const base = versionSpec ? `/${versionSpec}` : '';
  const link = s => (s && s.ref) ? { href: `${base}/${slugifyRef(s.ref)}`, label: headingHtml(s.heading) } : null;
  return { sep: '&nbsp;', prev: link(prev), next: link(next) };
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
