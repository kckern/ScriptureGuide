import db from '../db/connection.js';

// Database queries behind the parallel view (lib.parallel.php.inc in the PHP site).
export class ParallelRepository {
  constructor(database = db) {
    this.db = database;
  }

  async verses(ids, version) {
    if (!ids.length) return [];
    return this.db.query(
      `SELECT sv.verse_id, sv.version, sv.text, b.book_title AS book, v.chapter, v.verse
       FROM scripture_verses sv
       JOIN lds_scriptures_verses v ON v.verse_id = sv.verse_id
       JOIN lds_scriptures_books b ON b.book_id = v.book_id
       WHERE sv.version = ? AND sv.verse_id IN (?)
       ORDER BY sv.verse_id`,
      [version, ids]
    );
  }

  // Version-less verse text (plainData's "INDEX" fallback)
  async indexVerses(ids) {
    if (!ids.length) return [];
    return this.db.query('SELECT verse_id, verse_scripture AS text FROM lds_scriptures_verses WHERE verse_id IN (?) ORDER BY verse_id', [ids]);
  }

  // scripture_references in both directions between the sides, stand-ins only
  async standinReferences(leftIds, rightIds) {
    if (!leftIds.length || !rightIds.length) return { forward: [], backward: [] };
    const sql = col => `SELECT src_verse_id, dst_verse_id, standin, significant FROM scripture_references
      WHERE standin > 0 AND ${col[0]} IN (?) AND ${col[1]} IN (?)`;
    const backward = await this.db.query(sql(['dst_verse_id', 'src_verse_id']), [leftIds, rightIds]);
    const forward = await this.db.query(sql(['src_verse_id', 'dst_verse_id']), [leftIds, rightIds]);
    return { forward, backward };
  }

  async verseMeta(ids) {
    if (!ids.length) return [];
    return this.db.query(
      `SELECT v.verse_id, v.volume_id, v.book_id, v.chapter, v.verse,
         b.book_title, b.book_title_short, b.book_title_med
       FROM lds_scriptures_verses v JOIN lds_scriptures_books b ON b.book_id = v.book_id
       WHERE v.verse_id IN (?)`,
      [ids]
    );
  }

  // Every verse id of the chapters the given verses touch, chapter by chapter
  async chapterVerseIds(ids) {
    if (!ids.length) return [];
    const rows = await this.db.query(
      `SELECT c.verse_id FROM lds_scriptures_verses c
       JOIN (SELECT DISTINCT book_id, chapter FROM lds_scriptures_verses WHERE verse_id IN (?)) t
         ON t.book_id = c.book_id AND t.chapter = c.chapter
       ORDER BY c.verse_id`,
      [ids]
    );
    return rows.map(r => Number(r.verse_id));
  }

  async chapterMaxima(pairs) {
    if (!pairs.length) return [];
    return this.db.query(
      'SELECT book_id, chapter, MAX(verse) AS max FROM lds_scriptures_verses WHERE (book_id, chapter) IN (?) GROUP BY book_id, chapter',
      [pairs.map(p => [p.bookId, p.chapter])]
    );
  }

  async faxIds(version, ids) {
    const list = ids.filter(id => id != null);
    if (!version || !list.length) return new Set();
    const rows = await this.db.query('SELECT verse_id FROM scripture_faxindex WHERE version = ? AND verse_id IN (?)', [version, list.map(String)]);
    return new Set(rows.map(r => Number(r.verse_id)));
  }
}

export default new ParallelRepository();
