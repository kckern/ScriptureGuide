import db from '../db/connection.js';

// Queries behind the legacy data formats (api, meta, raw, plain), mirroring the PHP site's SQL.
// Values come back as strings, as PHP's mysqli returned them, so the JSON encoders see the same types.
const str = row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v == null ? v : String(v)]));

export class RawRepository {
  // scriptures::renderRaw
  async findRawVerses(version, verseIds) {
    if (!verseIds?.length) return [];
    const rows = await db.query(
      'SELECT verse_id, version, format, text, verse FROM scripture_verses WHERE version = ? AND verse_id IN (?)',
      [version, verseIds]
    );
    return rows.map(str);
  }

  // scriptures::scriptureData: the passage text for one version, in verse order.
  async findVersesInOrder(version, verseIds) {
    if (!verseIds?.length) return [];
    const rows = await db.query(
      'SELECT verse_id, verse, format, text, version FROM scripture_verses WHERE version = ? AND verse_id IN (?) ORDER BY verse_id',
      [version, verseIds]
    );
    return rows.map(str);
  }

  // scriptures::plainData: the verse index text when no version has the passage.
  async findIndexVerses(verseIds) {
    if (!verseIds?.length) return [];
    const rows = await db.query(
      'SELECT verse_id, verse_scripture FROM lds_scriptures_verses WHERE verse_id IN (?)',
      [verseIds]
    );
    return rows.map(str);
  }

  // scriptutil::loadHeading($verse_id, $versions, $section)
  async loadHeading(verseId, versions, section = null) {
    let id = Number(verseId);
    if (!/^§¶/.test(section ?? '')) id--;

    let items = [];
    let version;
    for (version of versions) {
      const book = await db.query('SELECT book_id FROM lds_scriptures_verses WHERE verse_id = ? LIMIT 1', [id]);
      const bookId = book[0]?.book_id ?? '';
      items = await db.query(
        `SELECT h.* FROM scripture_headings h
          WHERE version = ? AND book_id = ? AND verse_id <= ?
            AND verse_id = (SELECT max(verse_id) FROM scripture_headings
                             WHERE version = ? AND book_id = ? AND verse_id <= ? AND footer = 0)
          ORDER BY h.verse_id DESC`,
        [version, bookId, id, version, bookId, id]
      );
      if (items.length) break;
    }

    const first = items[0] ? str(items[0]) : {};
    const data = { id: first.id ?? null, version: first.version ?? null, verse_id: first.verse_id ?? null, prev_id: first.prev_id ?? null };
    for (const item of items) data[item.type] = item.text;

    const next = await db.query(
      'SELECT verse_id FROM scripture_headings WHERE version = ? AND verse_id > ? AND footer = 0 ORDER BY verse_id ASC LIMIT 1',
      [version ?? '', id]
    );
    if (next.length) {
      data.last = Number(next[0].verse_id) - 1;
    } else {
      const max = await db.query('SELECT max(verse_id) AS last FROM scripture_verses WHERE version = ?', [version ?? '']);
      data.last = max[0]?.last == null ? null : String(max[0].last);
    }

    // PHP: if($verse_id != $data['verse_id'] && empty($data['heading'])) return [];
    if (String(id) !== String(data.verse_id) && !data.heading) return null;
    return data;
  }
}

export default new RawRepository();
