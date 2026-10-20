import db from '../db/connection.js';

export class VerseRepository {
  async findByIds(verseIds, version = 'KJV') {
    if (!verseIds || verseIds.length === 0) {
      return [];
    }

    const rows = await db.query(
      `SELECT sv.verse_id, sv.verse, sv.text, sv.version, sv.format, sv.s, sv.p, v.chapter
       FROM scripture_verses sv
       JOIN lds_scriptures_verses v ON v.verse_id = sv.verse_id
       WHERE sv.verse_id IN (?) AND sv.version = ?
       ORDER BY sv.verse_id`,
      [verseIds, version]
    );

    return rows;
  }

  // Plain text from the verse index, for passages no version covers (PHP plainData).
  async findIndexByIds(verseIds) {
    if (!verseIds || verseIds.length === 0) return [];
    return db.query(
      `SELECT v.verse_id, v.verse, v.verse_scripture AS text, 'INDEX' AS version, 'prose' AS format,
        '' AS s, '' AS p, v.chapter
       FROM lds_scriptures_verses v
       WHERE v.verse_id IN (?)
       ORDER BY v.verse_id`,
      [verseIds]
    );
  }

  // All books of the verse index (cached; the table is static)
  async findAllBooks() {
    if (!this._books) {
      this._books = db.query(
        'SELECT book_id, volume_id, book_title, book_title_short, lds_org FROM lds_scriptures_books ORDER BY book_id'
      ).catch(err => { this._books = null; throw err; });
    }
    return this._books;
  }

  // Verse-index rows (verse_id, book, chapter, verse) for verse ids
  async findIndexRows(verseIds) {
    if (!verseIds || verseIds.length === 0) return [];
    return db.query(
      `SELECT v.verse_id, v.book_id, v.chapter, v.verse, b.book_title, b.book_title_short
       FROM lds_scriptures_verses v JOIN lds_scriptures_books b ON b.book_id = v.book_id
       WHERE v.verse_id IN (?) ORDER BY v.verse_id`,
      [verseIds]
    );
  }

  // Verse-index rows for a book, chapter range and optional verse range
  async findIndexRowsByBook(bookId, chapter, chapterEnd = null, verseStart = null, verseEnd = null) {
    if (verseStart != null) {
      return db.query(
        `SELECT verse_id, book_id, chapter, verse FROM lds_scriptures_verses
         WHERE book_id = ? AND chapter = ? AND verse BETWEEN ? AND ? ORDER BY verse_id`,
        [bookId, chapter, verseStart, verseEnd ?? verseStart]
      );
    }
    return db.query(
      `SELECT verse_id, book_id, chapter, verse FROM lds_scriptures_verses
       WHERE book_id = ? AND chapter BETWEEN ? AND ? ORDER BY verse_id`,
      [bookId, chapter, chapterEnd ?? chapter]
    );
  }

  async findByRange(startId, endId, version = 'KJV') {
    const rows = await db.query(
      `SELECT verse_id, verse, text, version, format
       FROM scripture_verses
       WHERE verse_id BETWEEN ? AND ? AND version = ?
       ORDER BY verse_id`,
      [startId, endId, version]
    );

    return rows;
  }

  // Get chapter number for each verse_id from the canonical verse table (no version filter)
  async findChaptersByVerseIds(verseIds) {
    if (!verseIds || verseIds.length === 0) return [];
    const rows = await db.query(
      'SELECT verse_id, chapter FROM lds_scriptures_verses WHERE verse_id IN (?)',
      [verseIds]
    );
    return rows;
  }

  async findVersionsForVerseIds(verseIds) {
    if (!verseIds || verseIds.length === 0) {
      return [];
    }

    const rows = await db.query(
      `SELECT DISTINCT version
       FROM scripture_verses
       WHERE verse_id IN (?)
       ORDER BY version`,
      [verseIds]
    );

    return rows.map(r => r.version);
  }

  // Resolve verse_ids from an lds_org slug + chapter (+ optional verse range)
  // Used as fallback when the scripture-guide package doesn't recognize the book
  // e.g. "song" (Song of Solomon), "abr" (Abraham), "fac" (Facsimiles)
  async findBySlug(bookSlug, chapter, verseStart = null, verseEnd = null) {
    const bookRows = await db.query(
      'SELECT book_id, book_title, book_title_short FROM lds_scriptures_books WHERE lds_org = ? LIMIT 1',
      [bookSlug]
    );
    if (!bookRows.length) return null;
    const { book_id, book_title, book_title_short } = bookRows[0];

    let verseRows;
    if (verseStart && verseEnd) {
      verseRows = await db.query(
        'SELECT verse_id FROM lds_scriptures_verses WHERE book_id = ? AND chapter = ? AND verse BETWEEN ? AND ? ORDER BY verse',
        [book_id, chapter, verseStart, verseEnd]
      );
    } else if (verseStart) {
      verseRows = await db.query(
        'SELECT verse_id FROM lds_scriptures_verses WHERE book_id = ? AND chapter = ? AND verse = ? LIMIT 1',
        [book_id, chapter, verseStart]
      );
    } else {
      verseRows = await db.query(
        'SELECT verse_id FROM lds_scriptures_verses WHERE book_id = ? AND chapter = ? ORDER BY verse',
        [book_id, chapter]
      );
    }

    if (!verseRows.length) return null;
    return {
      verseIds: verseRows.map(r => r.verse_id),
      book: book_title,
      bookShort: book_title_short,
      chapter: String(chapter)
    };
  }

  async findAvailableVersions(verseIds) {
    if (!verseIds || verseIds.length === 0) return [];

    const rows = await db.query(
      `SELECT sv.id, sv.title, sv.priority
       FROM scripture_verses v
       JOIN scripture_versions sv ON sv.id = v.version
       WHERE v.verse_id IN (?) AND sv.lang = 'en' AND sv.fax_only = 0
       GROUP BY sv.id
       ORDER BY sv.priority ASC`,
      [verseIds]
    );

    return rows;
  }
}

export default new VerseRepository();
