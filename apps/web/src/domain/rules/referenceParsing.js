// Fallback reference parsing for references the scripture-guide package does not know:
// verse ids ("26137"), JST books ("jst john.3.16"), and other collections in the verse
// index (Lectures on Faith, The Sealed Portion, ...). Book names are matched against
// lds_scriptures_books by the caller.

// "26137", "1-3", "1;5-6" → verse ids, or null when the string is not numeric
export function parseVerseIdList(ref) {
  const s = String(ref || '').replace(/\s+/g, '');
  if (!s || !/^[\d;,-]+$/.test(s) || !/\d/.test(s)) return null;
  const ids = [];
  for (const segment of s.split(/[;,]/).filter(Boolean)) {
    const [a, b] = segment.split('-').filter(Boolean).map(Number);
    const end = b ?? a;
    if (!Number.isFinite(a) || end < a || end - a > 50000) return null;
    for (let i = a; i <= end; i++) ids.push(i);
  }
  return ids.length ? ids : null;
}

// "jst john.3.16" → { book: 'jst john', chapter: 3, verseStart: 16, verseEnd: 16, chapterEnd: null }
export function splitBookReference(ref) {
  const s = String(ref || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const m = s.match(/^((?:\d\s*)?[^\d]*[^\d\s.:])[\s.]*(\d+)(?:[.:](\d+)(?:-(\d+))?)?(?:-(\d+))?$/);
  if (!m) return null;
  const book = m[1].replace(/[.\s]+$/, '').trim();
  if (!/[a-z]/.test(book)) return null;
  const verseStart = m[3] ? Number(m[3]) : null;
  return {
    book,
    chapter: Number(m[2]),
    verseStart,
    verseEnd: m[4] ? Number(m[4]) : verseStart,
    chapterEnd: !m[3] && m[5] ? Number(m[5]) : null,
  };
}

// Comparable form of a book title, short title or lds_org slug
export function bookKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[._]/g, ' ')
    .replace(/^(\d)(?=[a-z])/, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Display reference for rows { chapter, verse } of one book, in order.
// wholeChapters: the rows cover whole chapters, so verses are omitted.
export function formatReference(bookTitle, rows, wholeChapters) {
  if (!rows.length) return '';
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (wholeChapters) {
    return first.chapter === last.chapter ? `${bookTitle} ${first.chapter}` : `${bookTitle} ${first.chapter}-${last.chapter}`;
  }
  if (first.chapter !== last.chapter) {
    return `${bookTitle} ${first.chapter}:${first.verse}-${last.chapter}:${last.verse}`;
  }
  return first.verse === last.verse
    ? `${bookTitle} ${first.chapter}:${first.verse}`
    : `${bookTitle} ${first.chapter}:${first.verse}-${last.verse}`;
}
