import db from '../db/connection.js';

// Database reads for the v1 API (src/api/v1). Kept apart from the legacy repositories, which
// reproduce PHP queries.
// These queries rely on pool.query's client-side formatting (IN (?) with arrays, a numeric
// OFFSET ?), so they must not move to execute (server-side prepared statements).
export class ApiRepository {
  constructor(database = db) {
    this.db = database;
    this.translationCache = null;
  }

  // Map of lower-case id → { id, name }. Translations don't change while the process runs.
  async translations() {
    this.translationCache ??= this.db
      .query('SELECT id, title, title_long FROM scripture_versions ORDER BY priority, title')
      .then(rows => new Map(rows.map(r => [String(r.id).toLowerCase(), { id: String(r.id), name: r.title_long || r.title }])))
      .catch(err => { this.translationCache = null; throw err; });
    return this.translationCache;
  }

  // Index rows (book, chapter, verse) for verse ids, in order
  async indexRows(ids) {
    if (!ids.length) return [];
    return this.db.query(
      `SELECT v.verse_id, v.book_id, v.chapter, v.verse, b.book_title
       FROM lds_scriptures_verses v JOIN lds_scriptures_books b ON b.book_id = v.book_id
       WHERE v.verse_id IN (?) ORDER BY v.verse_id`,
      [ids]
    );
  }

  // One translation's text for verse ids
  async verses(ids, version) {
    if (!ids.length) return [];
    return this.db.query(
      'SELECT verse_id, text FROM scripture_verses WHERE version = ? AND verse_id IN (?) ORDER BY verse_id',
      [version, ids]
    );
  }

  // Section headings that start at one of the verse ids
  async headingStarts(ids, version) {
    if (!ids.length) return [];
    return this.db.query(
      `SELECT verse_id, text FROM scripture_headings
       WHERE version = ? AND type = 'heading' AND verse_id IN (?) ORDER BY verse_id, seq`,
      [version, ids]
    );
  }

  // The section heading in force at a verse: the last one at or before it in the same book.
  // When one verse has several heading rows the later one (higher seq) is the narrower heading
  // next to the text (ABWRKS 33825: "The Words and Acts of Alma the High Priest", seq 19, then
  // "The Words of Alma and of Amulek at Ammonihah", seq 20). Rows without seq have no order.
  async headingAt(verseId, bookId, version) {
    const [row] = await this.db.query(
      `SELECT h.text FROM scripture_headings h JOIN lds_scriptures_verses v ON v.verse_id = h.verse_id
       WHERE h.version = ? AND h.type = 'heading' AND v.book_id = ? AND h.verse_id <= ?
       ORDER BY h.verse_id DESC, h.seq DESC LIMIT 1`,
      [version, bookId, verseId]
    );
    return row?.text ?? null;
  }

  // Verse ids that scripture_references names as stand-ins for these verses
  async parallelSources(ids) {
    if (!ids.length) return [];
    const rows = await this.db.query(
      'SELECT DISTINCT src_verse_id FROM scripture_references WHERE standin > 0 AND dst_verse_id IN (?) ORDER BY src_verse_id',
      [ids]
    );
    return rows.map(r => Number(r.src_verse_id));
  }

  async chapterCount(bookId) {
    const [row] = await this.db.query('SELECT MAX(chapter) AS n FROM lds_scriptures_verses WHERE book_id = ?', [bookId]);
    return Number(row?.n ?? 0);
  }

  async verseCount(bookId, chapter) {
    const [row] = await this.db.query('SELECT MAX(verse) AS n FROM lds_scriptures_verses WHERE book_id = ? AND chapter = ?', [bookId, chapter]);
    return Number(row?.n ?? 0);
  }

  // A uniformly random verse id in [min, max] that the translation has text for, or null
  async randomVerseId({ range: [min, max], version }, random = Math.random) {
    const [count] = await this.db.query(
      'SELECT COUNT(*) AS n FROM scripture_verses WHERE version = ? AND verse_id BETWEEN ? AND ?',
      [version, min, max]
    );
    const n = Number(count?.n ?? 0);
    if (!n) return null;
    const [row] = await this.db.query(
      'SELECT verse_id FROM scripture_verses WHERE version = ? AND verse_id BETWEEN ? AND ? ORDER BY verse_id LIMIT 1 OFFSET ?',
      [version, min, max, Math.floor(random() * n)]
    );
    return row ? Number(row.verse_id) : null;
  }
}

export default new ApiRepository();
