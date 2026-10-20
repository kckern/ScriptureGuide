// Reference strings from verse metadata, after scriptutil::referenceFromVerseIds.
// Rows: { verse_id, book_id, chapter, verse, chapter_max, book_title, book_title_short }.
// Output: "Gen. 22:1–14", "John 3:16", "Gen. 22" (whole chapter), "Matt. 5:48–6:2"; runs of
// non-contiguous verses are joined with "; ".
export function formatReference(rows, bookField = 'book_title') {
  const sorted = [...rows].sort((a, b) => a.verse_id - b.verse_id);
  const runs = [];
  for (const row of sorted) {
    const run = runs[runs.length - 1];
    if (run && row.verse_id === run.last.verse_id + 1 && row.book_id === run.first.book_id) run.last = row;
    else runs.push({ first: row, last: row });
  }
  return runs.map(({ first, last }) => {
    const book = first[bookField];
    const startsChapter = first.verse === 1;
    const endsChapter = last.chapter_max != null && last.verse === last.chapter_max;
    if (startsChapter && endsChapter) {
      return first.chapter === last.chapter ? `${book} ${first.chapter}` : `${book} ${first.chapter}–${last.chapter}`;
    }
    if (first.chapter === last.chapter) {
      return first.verse === last.verse
        ? `${book} ${first.chapter}:${first.verse}`
        : `${book} ${first.chapter}:${first.verse}–${last.verse}`;
    }
    return `${book} ${first.chapter}:${first.verse}–${last.chapter}:${last.verse}`;
  }).join('; ');
}

// Chapter of a verse as a slug: "Gen. 22" → "gen.22" (versebox.php chapterSlug).
export function chapterRef(row, bookField = 'book_title_short') {
  return `${row[bookField]} ${row.chapter}`;
}
