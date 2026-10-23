import db from '../db/connection.js';

// Queries behind the AJAX endpoints (vbox, versionselect, settings), ported from versebox.php,
// version_select.php, settings.php and scriptutil.php.inc.
//
// The PHP queries GROUP BY one column and select the rest without aggregates, which MySQL 8
// rejects under ONLY_FULL_GROUP_BY. ANY_VALUE() keeps the same GROUP BY + ORDER BY plan, so rows
// that tie on priority come back in the same order the PHP site shows them (a plain ORDER BY
// without the GROUP BY orders ties differently).
export class VerseboxRepository {
  // lds_scriptures_verses row plus book titles for one verse.
  async findVerse(verseId) {
    const rows = await db.query(
      `SELECT l.verse_id, l.volume_id, l.book_id, l.chapter, l.verse, l.verse_title, l.verse_title_short,
              b.book_title, b.book_title_short
       FROM lds_scriptures_verses l
       JOIN lds_scriptures_books b ON b.book_id = l.book_id
       WHERE l.verse_id = ?`,
      [verseId]
    );
    return rows[0] || null;
  }

  // Book/chapter metadata for building references, with each chapter's last verse number
  // (grouped once per chapter: a correlated MAX per row took ~60 ms for a 150-verse chapter set).
  async findVerseMeta(verseIds) {
    if (!verseIds?.length) return [];
    return db.query(
      `SELECT l.verse_id, l.volume_id, l.book_id, l.chapter, l.verse, b.book_title, b.book_title_short, m.chapter_max
       FROM lds_scriptures_verses l
       JOIN lds_scriptures_books b ON b.book_id = l.book_id
       JOIN (SELECT book_id, chapter, MAX(verse) AS chapter_max FROM lds_scriptures_verses
             WHERE (book_id, chapter) IN (SELECT book_id, chapter FROM lds_scriptures_verses WHERE verse_id IN (?))
             GROUP BY book_id, chapter) m ON m.book_id = l.book_id AND m.chapter = l.chapter
       WHERE l.verse_id IN (?)
       ORDER BY l.verse_id`,
      [verseIds, verseIds]
    );
  }

  // Every English version of a verse with its text, in the site's priority order (versebox.php).
  async findEnglishVersions(verseId) {
    return db.query(
      `SELECT ANY_VALUE(v.verse_id) AS verse_id, ANY_VALUE(v.version) AS version, ANY_VALUE(v.text) AS text
       FROM scripture_verses v
       JOIN scripture_versions r ON r.id = v.version
       WHERE v.verse_id = ? AND r.lang = 'en'
       GROUP BY v.uid
       ORDER BY ANY_VALUE(r.priority) ASC`,
      [verseId]
    );
  }

  // Versions with a facsimile page for this verse (scripture_faxindex.verse_id is a varchar).
  async findFaxVersions(verseId) {
    const rows = await db.query(
      'SELECT DISTINCT version FROM scripture_faxindex WHERE verse_id = ?',
      [String(verseId)]
    );
    return rows.map(r => r.version);
  }

  // Verses that point at this one (versebox.php, LIMIT 50 like the PHP query).
  async findReferences(verseId) {
    return db.query(
      `SELECT r.src_verse_id AS verse_id, ANY_VALUE(r.type) AS type, ANY_VALUE(r.source) AS source,
              ANY_VALUE(r.\`match\`) AS \`match\`, ANY_VALUE(r.standin) AS standin, ANY_VALUE(r.significant) AS significant
       FROM scripture_references r
       WHERE r.dst_verse_id = ?
       GROUP BY r.src_verse_id
       LIMIT 50`,
      [verseId]
    );
  }

  // Text of each verse in `version`. A verse missing from that version falls back to the first of
  // defaultsFor(id) that has it (the volume defaults scriptures::lookup added to the requested
  // version: Dhammapada read as LDS is GFRONSDAL), then to the highest-priority version that has it
  // (e.g. JST verses read as LDS come back as JST).
  async findTexts(verseIds, version, defaultsFor = () => []) {
    if (!verseIds?.length) return [];
    const rows = await db.query(
      `SELECT v.verse_id, v.version, v.text
       FROM scripture_verses v
       WHERE v.verse_id IN (?) AND v.version = ?`,
      [verseIds, version]
    );
    const found = new Map(rows.map(r => [r.verse_id, r]));
    const missing = verseIds.filter(id => !found.has(id));
    if (missing.length) {
      const fallback = await db.query(
        `SELECT v.verse_id, v.version, v.text
         FROM scripture_verses v
         JOIN scripture_versions s ON s.id = v.version
         WHERE v.verse_id IN (?)
         ORDER BY v.verse_id, s.priority, v.id`,
        [missing]
      );
      const byId = new Map();
      for (const r of fallback) {
        if (!byId.has(r.verse_id)) byId.set(r.verse_id, []);
        byId.get(r.verse_id).push(r);
      }
      for (const [id, list] of byId) {
        const preferred = defaultsFor(id).map(v => list.find(r => r.version === v)).find(Boolean);
        found.set(id, preferred || list[0]);
      }
    }
    return verseIds.filter(id => found.has(id)).map(id => found.get(id));
  }

  // scriptures::availableVersions — versions (any lang, default English) that have any of the verses.
  async findAvailableVersions(verseIds, lang = 'en') {
    if (!verseIds?.length) return [];
    return db.query(
      `SELECT ANY_VALUE(s.id) AS id, ANY_VALUE(s.title) AS title, ANY_VALUE(s.title_long) AS title_long
       FROM scripture_verses v
       JOIN scripture_versions s ON s.id = v.version
       WHERE v.verse_id IN (?) AND s.lang = ? AND s.fax_only = 0
       GROUP BY v.version
       ORDER BY ANY_VALUE(s.priority) ASC`,
      [verseIds, lang]
    );
  }

  // scriptutil::getVolID — volume of the first matching verse, 3 when none.
  async findVolumeId(verseIds) {
    if (!verseIds?.length) return 3;
    const rows = await db.query(
      'SELECT DISTINCT volume_id FROM lds_scriptures_verses WHERE verse_id IN (?)',
      [verseIds]
    );
    return rows[0]?.volume_id || 3;
  }

  // scriptutil::loadPrefs — saved preferences for a user, read only.
  async findPrefs(username) {
    if (!username) return null;
    const rows = await db.query('SELECT prefs_json FROM user_prefs WHERE username = ? LIMIT 1', [username]);
    if (!rows[0]?.prefs_json) return null;
    try { return JSON.parse(rows[0].prefs_json); } catch { return null; }
  }
}

export default new VerseboxRepository();
