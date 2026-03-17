import db from '../db/connection.js';

export class VerseRepository {
  async findByIds(verseIds, version = 'KJV') {
    if (!verseIds || verseIds.length === 0) {
      return [];
    }

    const rows = await db.query(
      `SELECT verse_id, verse, text, version, format, s, p
       FROM scripture_verses
       WHERE verse_id IN (?) AND version = ?
       ORDER BY verse_id`,
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
