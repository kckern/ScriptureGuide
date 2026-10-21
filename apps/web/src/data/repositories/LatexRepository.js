import db from '../db/connection.js';
import defaultHeadings from './HeadingRepository.js';

// Data for the LaTeX output (PHP renderRaw + inc_latex.php lookups).
export class LatexRepository {
  constructor(database = db, headings = defaultHeadings) {
    this.db = database;
    this.headings = headings;
  }

  // PHP scriptures::renderRaw: the raw verse rows of one version, keyed and sorted by verse_id.
  async rawVerses(verseIds, version) {
    if (!verseIds?.length) return [];
    return this.db.query(
      `SELECT verse_id, version, format, text, verse FROM scripture_verses
       WHERE version = ? AND verse_id IN (?) ORDER BY verse_id`,
      [version, verseIds]
    );
  }

  // PHP scriptutil::loadHeading($verse_id, [$version], "§¶", true) as used by renderRaw:
  // the heading rows at the nearest heading verse at or before verse_id in the same book,
  // as a map type → text. null when PHP returned [] (a verse past its heading with no
  // `heading` row). The `last` key PHP added is not used by the LaTeX output and is omitted.
  async loadHeading(verseId, version) {
    const book = await this.db.query('SELECT book_id FROM lds_scriptures_verses WHERE verse_id = ? LIMIT 1', [verseId]);
    const bookId = book[0]?.book_id ?? null;
    const items = await this.headings.findHeadingRowsAtOrBefore(version, bookId, verseId);
    const data = {};
    for (const item of items) data[item.type] = item.text;
    const headingVerseId = items[0]?.verse_id ?? null;
    if (verseId !== headingVerseId && !data.heading) return null;
    return data;
  }

  // verse_id → { book_id, chapter, verse } from the canonical verse table.
  async verseInfo(verseIds) {
    const map = new Map();
    if (!verseIds?.length) return map;
    const rows = await this.db.query(
      'SELECT verse_id, book_id, chapter, verse FROM lds_scriptures_verses WHERE verse_id IN (?)',
      [verseIds]
    );
    for (const r of rows) map.set(r.verse_id, r);
    return map;
  }

  // KRSEB heading levels (PHP findLevel), as a map "verse_id:type" → level (first row wins).
  async headingLevels(verseIds) {
    const map = new Map();
    if (!verseIds?.length) return map;
    const rows = await this.db.query(
      "SELECT verse_id, type, level FROM scripture_headings WHERE version = 'KRSEB' AND verse_id IN (?)",
      [verseIds]
    );
    for (const r of rows) {
      const key = `${r.verse_id}:${r.type}`;
      if (!map.has(key)) map.set(key, r.level);
    }
    return map;
  }

  // KRSEB footnotes by note_id (PHP lookupFootnote), with the verse number of the note's verse.
  async footnotes(noteIds) {
    const map = new Map();
    if (!noteIds?.length) return map;
    const rows = await this.db.query(
      `SELECT f.note_id, f.verse_id, f.html, f.type, f.audit, v.verse
       FROM scripture_footnotes f LEFT JOIN lds_scriptures_verses v ON v.verse_id = f.verse_id
       WHERE f.version = 'KRSEB' AND f.note_id IN (?)`,
      [noteIds]
    );
    for (const r of rows) if (!map.has(String(r.note_id))) map.set(String(r.note_id), r);
    return map;
  }
}

export default new LatexRepository();
