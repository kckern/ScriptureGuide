import db from '../db/connection.js';

export class VersionRepository {
  async findAll() {
    const rows = await db.query(
      `SELECT id, title, title_long, lang, priority, volumes, audio, searchable
       FROM scripture_versions
       ORDER BY priority, title`
    );

    return rows;
  }

  async findByCode(versionCode) {
    const rows = await db.query(
      `SELECT id, title, title_long, lang, priority, volumes, audio, searchable
       FROM scripture_versions
       WHERE id = ?`,
      [versionCode]
    );

    return rows[0] || null;
  }

  async findByVolume(volume) {
    const rows = await db.query(
      `SELECT DISTINCT v.id, v.title, v.title_long, v.lang, v.priority
       FROM scripture_versions v
       INNER JOIN scripture_verses sv ON v.id = sv.version
       WHERE v.volumes LIKE ?
       ORDER BY v.priority, v.title`,
      [`%${volume}%`]
    );

    return rows;
  }
}

export default new VersionRepository();
