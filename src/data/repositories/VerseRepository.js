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
