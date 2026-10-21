import db from '../db/connection.js';
import { fulltextPlan, fulltextSettings } from '../../services/search/fulltext.js';

// Database queries behind the search page (scriptures::search and search.php in the PHP site).
export class SearchRepository {
  constructor(database = db) {
    this.db = database;
  }

  // scriptutil::listVersions: searchable versions by priority (ties in table order),
  // or only the forced ones when a version is in the path.
  async searchableVersions(forced = null) {
    const rows = forced
      ? await this.db.query('SELECT id FROM scripture_versions WHERE id IN (?) AND searchable = 1 ORDER BY priority, `index`', [[].concat(forced)])
      : await this.db.query('SELECT id FROM scripture_versions WHERE searchable = 1 ORDER BY priority, `index`');
    return rows.map(r => r.id);
  }

  // scriptutil::listVolumeVersions
  async volumeVersions(volume) {
    const rows = await this.db.query('SELECT id FROM scripture_versions WHERE volumes LIKE ? ORDER BY priority, `index`', [`%${volume}%`]);
    return rows.map(r => r.id);
  }

  async versionsByPriority(ids) {
    if (!ids.length) return [];
    const rows = await this.db.query('SELECT id FROM scripture_versions WHERE id IN (?) ORDER BY priority, `index`', [ids]);
    return rows.map(r => r.id);
  }

  // The FULLTEXT index settings (search/fulltext.js), looked up once
  fulltext() {
    this.fulltextPending ??= fulltextSettings(this.db);
    return this.fulltextPending;
  }

  // The highest row id of scripture_verses, looked up once (the table does not change while the
  // process runs; a failed lookup is retried)
  maxId() {
    this.maxIdPending ??= this.db.query('SELECT MAX(id) AS max FROM scripture_verses')
      .then(([row]) => Number(row?.max ?? 0))
      .catch(err => { this.maxIdPending = null; throw err; });
    return this.maxIdPending;
  }

  // Candidate verses for the MySQL fallback: the text has a word starting with each stem's prefix
  // (through the FULLTEXT index where it covers the stem), or contains the prefix (LIKE).
  // The caller filters the candidates with the Sphinx tokenizer and stemmer.
  //
  // Pages by primary key: up to `limit` rows after afterId. A LIKE-only query over all versions
  // reads the table in id order, and when no row matches that read can cover the whole table
  // (about 2 s), so with `scan` it reads at most that many ids per query.
  // Returns { rows, through, done, scanned }: continue after `through` unless `done`; `scanned`
  // estimates the rows read (the id span of a bounded scan, else the rows returned).
  async candidates(stems, versions, { range = null, afterId = 0, limit = 5000, scan = null } = {}) {
    if (!stems.length || !versions.length) return { rows: [], through: afterId, done: true, scanned: 0 };
    // Within a verse range (the LDS/KJV requery) MySQL reads the versions' rows through the version
    // index, about 70,000, faster than MATCH on a three-letter prefix ('+lor*'), so those stay LIKE.
    const { match, like } = fulltextPlan(stems, await this.fulltext(), { minPrefix: range ? 4 : 1 });
    const bounded = !match && !range && scan > 0;
    const where = bounded ? ['id > ? AND id <= ?'] : ['id > ?'];
    const params = bounded ? [afterId, afterId + scan] : [afterId];
    where.push('version IN (?)');
    params.push(versions);
    if (match) {
      where.push('MATCH(text) AGAINST(? IN BOOLEAN MODE)');
      params.push(match);
    }
    for (const p of like) {
      where.push('text LIKE ?');
      params.push(`%${p.replace(/[\\%_]/g, '\\$&')}%`);
    }
    if (range) {
      where.push('verse_id BETWEEN ? AND ?');
      params.push(range[0], range[1]);
    }
    params.push(limit);
    const rows = await this.db.query(`SELECT id, verse_id, version, text FROM scripture_verses WHERE ${where.join(' AND ')} ORDER BY id LIMIT ?`, params);
    const full = rows.length >= limit;
    if (full || !bounded) {
      const through = rows.length ? rows[rows.length - 1].id : afterId;
      return { rows, through, done: !full, scanned: bounded ? through - afterId : rows.length };
    }
    const through = afterId + scan;
    return { rows, through, done: through >= await this.maxId(), scanned: scan };
  }

  // Stand-in duplicates for Book of Commandments / 1835 D&C verses
  async standins(srcIds) {
    if (!srcIds.length) return [];
    return this.db.query(
      'SELECT dst_verse_id, src_verse_id FROM scripture_references WHERE src_verse_id IN (?) AND standin = 1 AND significant = 0',
      [srcIds]
    );
  }

  // Volume, book and title metadata for verse ids
  async verseInfo(ids) {
    if (!ids.length) return [];
    return this.db.query(
      `SELECT v.verse_id, v.volume_id, v.book_id, v.chapter, v.verse, v.verse_title,
         b.book_title, b.book_title_short, b.book_title_med,
         vol.lds_org AS vol_org, vol.volume_title_med
       FROM lds_scriptures_verses v
       JOIN lds_scriptures_books b ON b.book_id = v.book_id
       JOIN lds_scriptures_volumes vol ON vol.volume_id = v.volume_id
       WHERE v.verse_id IN (?)`,
      [ids]
    );
  }

  async chapterMaxima(pairs) {
    if (!pairs.length) return [];
    return this.db.query(
      'SELECT book_id, chapter, MAX(verse) AS max FROM lds_scriptures_verses WHERE (book_id, chapter) IN (?) GROUP BY book_id, chapter',
      [pairs.map(p => [p.bookId, p.chapter])]
    );
  }

  // Text of (verse_id, version) pairs
  async texts(pairs) {
    if (!pairs.length) return [];
    return this.db.query(
      'SELECT verse_id, version, text FROM scripture_verses WHERE (verse_id, version) IN (?)',
      [pairs.map(p => [p.verse_id, p.version])]
    );
  }

  // Paragraph format of a verse in another version (format override, e.g. KJV text in MEV format)
  async formats(ids, version) {
    if (!ids.length) return [];
    return this.db.query('SELECT verse_id, format, p, s, version FROM scripture_verses WHERE version = ? AND verse_id IN (?)', [version, ids]);
  }
}

export default new SearchRepository();
