import db from '../db/connection.js';

// Notes of the study editions (scripture_footnotes), keyed by the ｢N｣ markers in verse and
// heading text (domain/rules/footnotes.js).
export class FootnoteRepository {
  constructor(database = db) {
    this.db = database;
  }

  // Every version's row for the note ids
  async notesByIds(ids) {
    if (!ids?.length) return [];
    return this.db.query(
      'SELECT version, note_id, html, type, data FROM scripture_footnotes WHERE note_id IN (?) ORDER BY note_id, version',
      [ids]
    );
  }
}

export default FootnoteRepository;
