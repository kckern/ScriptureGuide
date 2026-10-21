// Verse lookups by verse_title, as the PHP site's scriptutil did them (loadChapterMax,
// loadVerseIds, referenceFromVerseIds), for LegacyBlockService.
import db from '../db/connection.js';
import { formatReference } from '../../domain/rules/legacyReference.js';

export class LegacyReferenceRepository {
  constructor(database = db) {
    this.db = database;
  }

  // The last verse of a chapter reference ("1 Kings 1"), or null
  async chapterMax(ref) {
    const like = `${String(ref).replace(/[\\%_]/g, '\\$&')}:%`;
    const rows = await this.db.query('SELECT MAX(verse) AS c FROM lds_scriptures_verses WHERE verse_title LIKE ?', [like]);
    return rows[0]?.c ?? null;
  }

  // The last verse of every chapter of a book in one query: "<book> <chapter>" → its last verse
  // (what chapterMax gives for each chapter; verse_title compares case-sensitively)
  async chapterMaxima(book) {
    const like = `${String(book).replace(/[\\%_]/g, '\\$&')} %`;
    const rows = await this.db.query(
      "SELECT SUBSTRING_INDEX(verse_title, ':', 1) AS ref, MAX(verse) AS c FROM lds_scriptures_verses WHERE verse_title LIKE ? GROUP BY ref",
      [like]
    );
    return new Map(rows.map(r => [String(r.ref), r.c]));
  }

  // Verse ids of "Book C:V" titles, in verse id order
  async verseIds(titles) {
    if (!titles.length) return [];
    const rows = await this.db.query('SELECT verse_id FROM lds_scriptures_verses WHERE verse_title IN (?) ORDER BY verse_id', [titles]);
    return rows.map(r => r.verse_id);
  }

  // referenceFromVerseIds(ids, 'book_title'): '' when no id is a verse
  async referenceFromVerseIds(ids) {
    const ints = [...new Set(ids.filter(Number.isInteger))];
    if (!ints.length) return '';
    const rows = await this.db.query(
      `SELECT v.verse_id, v.book_id, v.chapter, v.verse, b.book_title
       FROM lds_scriptures_verses v JOIN lds_scriptures_books b ON b.book_id = v.book_id
       WHERE v.verse_id IN (?)`,
      [ints]
    );
    if (!rows.length) return '';
    const info = new Map(rows.map(r => [r.verse_id, { book: r.book_title, bookId: r.book_id, chapter: r.chapter, verse: r.verse }]));
    const pairs = [...new Map(rows.map(r => [`${r.book_id}|${r.chapter}`, [r.book_id, r.chapter]])).values()];
    const maxima = await this.db.query(
      'SELECT book_id, chapter, MAX(verse) AS max FROM lds_scriptures_verses WHERE (book_id, chapter) IN (?) GROUP BY book_id, chapter',
      [pairs]
    );
    const max = new Map(maxima.map(r => [`${r.book_id}|${r.chapter}`, Number(r.max)]));
    return formatReference(ints, info, (b, c) => max.get(`${b}|${c}`));
  }
}

export default new LegacyReferenceRepository();
