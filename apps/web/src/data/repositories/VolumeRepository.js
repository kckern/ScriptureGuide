import db from '../db/connection.js';

export class VolumeRepository {
  constructor(database = db) {
    this.db = database;
  }

  // Volume id of the first of the verses (PHP scriptutil::getVolID), or null.
  async volumeIdOf(verseIds) {
    if (!verseIds?.length) return null;
    const rows = await this.db.query(
      'SELECT volume_id FROM lds_scriptures_verses WHERE verse_id = ? LIMIT 1',
      [verseIds[0]]
    );
    return rows[0]?.volume_id ?? null;
  }
}

export default new VolumeRepository();
