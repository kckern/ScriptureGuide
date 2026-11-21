// Why a reference found no verses: an unknown book, a chapter or verse past the end, or text
// that can't be read as a reference. Returns an ApiError (the caller throws it).
// Only the start of a range is checked: "gen 1:1-99" is not diagnosed.
import { lookupReference } from 'scripture-guide';
import { ApiError } from './errors.js';

// "jon3.16" → book "jon", chapter 3, verse 16; "2ne12" → "2ne", 12; "1 john 9:2" → "1 john", 9, 2
const PARTS = /^(\d?\s*[^\d]+?)[\s.]*(\d+)(?:[\s.:]+(\d+))?/;

export async function diagnoseMiss(query, repo) {
  const text = String(query).trim();
  const unreadable = () => new ApiError('unparseable_reference', `"${text}" can't be read as a reference.`);
  if (!/[a-z]/i.test(text) || !/\d/.test(text)) return unreadable();

  const parts = text.match(PARTS);
  if (!parts) return unreadable();
  const [, bookText, chapterText, verseText] = parts;

  const first = lookupReference(`${bookText.trim()} 1`);
  if (!first.verse_ids?.length) return new ApiError('unknown_book', `No book matches "${bookText.trim()}".`);
  const [row] = await repo.indexRows([first.verse_ids[0]]);
  if (!row) return unreadable();
  const book = row.book_title;

  const chapters = await repo.chapterCount(row.book_id);
  // In a one-chapter book a lone number is a verse: "jude 30" is Jude 1:30
  const [chapter, verse] = chapters === 1 && !verseText
    ? [1, Number(chapterText)]
    : [Number(chapterText), verseText ? Number(verseText) : null];
  if (chapter > chapters) {
    return new ApiError('chapter_out_of_range', `${book} has ${chapters} chapter${chapters === 1 ? '' : 's'}.`, `${book} ${chapters}`);
  }
  if (verse !== null) {
    const verses = await repo.verseCount(row.book_id, chapter);
    if (verse > verses) {
      return new ApiError('verse_out_of_range', `${book} ${chapter} has ${verses} verse${verses === 1 ? '' : 's'}.`, `${book} ${chapter}:${verses}`);
    }
  }
  return unreadable();
}
