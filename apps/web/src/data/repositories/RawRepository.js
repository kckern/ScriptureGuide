import db from '../db/connection.js';
import headingRepository from './HeadingRepository.js';

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
      // PHP compared book_id = '' when the verse is missing, which MySQL reads as 0
      const bookId = book[0]?.book_id ?? 0;
      items = await headingRepository.findHeadingRowsAtOrBefore(version, bookId, id);
      if (items.length) break;
    }

    const first = items[0] ? str(items[0]) : {};
    const data = { id: first.id ?? null, version: first.version ?? null, verse_id: first.verse_id ?? null, prev_id: first.prev_id ?? null };
    for (const item of items) data[item.type] = item.text;

    const next = await headingRepository.nextHeadingVerse(version ?? '', id);
    if (next != null) {
      data.last = next - 1;
    } else {
      const max = await headingRepository.findVersionLastVerseId(version ?? '');
      data.last = max == null ? null : String(max);
    }

    // PHP: if($verse_id != $data['verse_id'] && empty($data['heading'])) return [];
    if (String(id) !== String(data.verse_id) && !data.heading) return null;
    return data;
  }
}

export default new RawRepository();
