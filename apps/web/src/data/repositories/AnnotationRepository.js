import db from '../db/connection.js';

// Commentary notes on words of the Book of Mormon (notes.scripture.guide).
export class AnnotationRepository {
  constructor(database = db) {
    this.db = database;
  }

  // scripture_annotations_index rows for the verses, optionally limited to source ids.
  async indexForVerses(verseIds, sources = null) {
    if (!verseIds?.length) return [];
    let sql = 'SELECT * FROM scripture_annotations_index WHERE verse_id IN (?)';
    const params = [verseIds];
    if (sources?.length) { sql += ' AND source IN (?)'; params.push(sources); }
    return this.db.query(sql, params);
  }

  // Notes with their source, in annotation id order.
  async notesByIds(ids) {
    if (!ids?.length) return [];
    return this.db.query(
      `SELECT a.id, a.verse_id, a.html, s.source_title, s.source_name, s.source_slug
       FROM scripture_annotations a JOIN scripture_annotation_sources s ON a.source = s.source_id
       WHERE a.id IN (?) ORDER BY a.id`,
      [ids]
    );
  }

  // "Book chapter:verse" for one verse id (PHP referenceFromVerseIds, book_title), or ''.
  async referenceFor(verseId) {
    if (!/^\d+$/.test(String(verseId))) return '';
    const rows = await this.db.query(
      `SELECT b.book_title, v.chapter, v.verse FROM lds_scriptures_verses v
       JOIN lds_scriptures_books b ON b.book_id = v.book_id WHERE v.verse_id = ?`,
      [Number(verseId)]
    );
    const r = rows[0];
    return r ? `${r.book_title} ${r.chapter}:${r.verse}` : '';
  }
}

export default new AnnotationRepository();
