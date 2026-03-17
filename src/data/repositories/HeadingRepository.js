import db from '../db/connection.js';

export class HeadingRepository {
  // Inline headings for verses - filtered by version, includes last_verse_id via self-join
  async findByVerseIds(verseIds, version = 'LDS') {
    if (!verseIds || verseIds.length === 0) return [];

    const rows = await db.query(
      `SELECT h.verse_id, h.version, h.type, h.text, h.style, h.level, h.seq, h.footer, h.book_id,
        (SELECT MIN(h2.verse_id) - 1
         FROM scripture_headings h2
         WHERE h2.version = h.version AND h2.book_id = h.book_id
           AND h2.verse_id > h.verse_id AND h2.footer = 0
        ) AS last_verse_id
       FROM scripture_headings h
       WHERE h.verse_id IN (?) AND h.version = ?
       ORDER BY h.verse_id, h.seq`,
      [verseIds, version]
    );

    return rows;
  }

  // Chapter-level heading: find most recent heading record at or before first verse
  // Mirrors PHP's loadHeading() logic
  // isNewSection: if first verse starts with §¶, PHP does NOT decrement verse_id
  async findChapterHeading(firstVerseId, bookId, version = 'LDS', isNewSection = false) {
    const lookupId = isNewSection ? firstVerseId : firstVerseId - 1;

    const rows = await db.query(
      `SELECT h.* FROM scripture_headings h
       WHERE h.version = ?
         AND h.book_id = ?
         AND h.verse_id = (
           SELECT MAX(verse_id) FROM scripture_headings
           WHERE version = ? AND book_id = ? AND verse_id <= ? AND footer = 0
         )
       ORDER BY h.verse_id DESC`,
      [version, bookId, version, bookId, lookupId]
    );

    if (!rows.length) return null;

    // Aggregate all types from matching rows into one object
    const heading = { verse_id: rows[0].verse_id, version: rows[0].version };
    for (const row of rows) {
      heading[row.type] = row.text;
    }

    // Find last verse covered by this heading
    const [next] = await db.query(
      `SELECT verse_id FROM scripture_headings
       WHERE version = ? AND book_id = ? AND verse_id > ? AND footer = 0
       ORDER BY verse_id ASC LIMIT 1`,
      [version, bookId, rows[0].verse_id]
    );
    heading.last = next ? next.verse_id - 1 : null;

    return heading;
  }

  // Chapter nav: get first verse of prev and next chapters
  async findChapterNav(firstVerseId, lastVerseId) {
    const [prev] = await db.query(
      `SELECT v.verse_id, v.chapter, b.book_title_short as book, b.lds_org as slug
       FROM lds_scriptures_verses v
       JOIN lds_scriptures_books b ON v.book_id = b.book_id
       WHERE v.verse_id < ? ORDER BY v.verse_id DESC LIMIT 1`,
      [firstVerseId]
    );

    const [next] = await db.query(
      `SELECT v.verse_id, v.chapter, b.book_title_short as book, b.lds_org as slug
       FROM lds_scriptures_verses v
       JOIN lds_scriptures_books b ON v.book_id = b.book_id
       WHERE v.verse_id > ? ORDER BY v.verse_id ASC LIMIT 1`,
      [lastVerseId]
    );

    return {
      prev: prev ? { verseId: prev.verse_id, label: `${prev.book} ${prev.chapter}`, slug: `${prev.slug}.${prev.chapter}` } : null,
      next: next ? { verseId: next.verse_id, label: `${next.book} ${next.chapter}`, slug: `${next.slug}.${next.chapter}` } : null
    };
  }

  // Book info for a verse — used for slug/heading computation
  async findBookId(verseId) {
    const rows = await db.query(
      `SELECT v.book_id, b.lds_org, b.book_title_short, b.book_title
       FROM lds_scriptures_verses v
       JOIN lds_scriptures_books b ON b.book_id = v.book_id
       WHERE v.verse_id = ? LIMIT 1`,
      [verseId]
    );
    return rows[0] || null;
  }

  // Find parallel cross-references for a range of verse_ids
  // Returns map of range.from → parallel attr string
  // PHP logic: include ALL standin rows if at least one is significant
  async findParallels(verseIdRanges, version = '') {
    if (!verseIdRanges || verseIdRanges.length === 0) return {};
    const versionPrefix = version ? `${version.toLowerCase()}/` : '';

    const allIds = verseIdRanges.flatMap(r => {
      const ids = [];
      for (let i = r.from; i <= r.to; i++) ids.push(i);
      return ids;
    });
    if (!allIds.length) return {};

    const rows = await db.query(
      `SELECT r.src_verse_id, r.dst_verse_id, r.significant,
        v.chapter AS src_chapter, v.verse AS src_verse, v.book_id AS src_book_id,
        b.book_title_short AS src_book_slug, b.book_title AS src_book_title,
        vol.lds_org AS vol_org
       FROM scripture_references r
       JOIN lds_scriptures_verses v ON v.verse_id = r.src_verse_id
       JOIN lds_scriptures_books b ON b.book_id = v.book_id
       JOIN lds_scriptures_volumes vol ON vol.volume_id = v.volume_id
       WHERE r.dst_verse_id IN (?) AND r.standin > 0
       ORDER BY r.dst_verse_id, r.src_verse_id`,
      [allIds]
    );

    // Batch-fetch chapter sizes for src chapters referenced by synthetic/wholeChapter headings.
    // Used to determine if a src verse range covers the full chapter (→ chapter-level slug).
    const chapterSizeMap = {};
    const chaptersToFetch = [];
    for (const range of verseIdRanges) {
      if (!(range.synthetic || range.wholeChapter)) continue;
      const rangeRows = rows.filter(r => r.dst_verse_id >= range.from && r.dst_verse_id <= range.to);
      for (const row of rangeRows) {
        const key = `${row.src_book_id}:${row.src_chapter}`;
        if (!chapterSizeMap[key]) chaptersToFetch.push({ book_id: row.src_book_id, chapter: row.src_chapter, key });
      }
    }
    if (chaptersToFetch.length) {
      const uniquePairs = [...new Map(chaptersToFetch.map(p => [p.key, p])).values()];
      for (const pair of uniquePairs) {
        const [sizeRow] = await db.query(
          'SELECT COUNT(*) AS cnt FROM lds_scriptures_verses WHERE book_id = ? AND chapter = ?',
          [pair.book_id, pair.chapter]
        );
        chapterSizeMap[pair.key] = sizeRow?.cnt ?? 0;
      }
    }

    const result = {};
    for (const range of verseIdRanges) {
      const rangeRows = rows.filter(r => r.dst_verse_id >= range.from && r.dst_verse_id <= range.to);
      if (!rangeRows.length) continue;

      // Only output if at least one row is significant (PHP: $sig check)
      const hasSig = rangeRows.some(r => r.significant === 1);
      if (!hasSig) continue;

      // Group by label: JST→"JST", OT/NT→volume, numeric vol_org (e.g. "1835")→vol_org, else→book_title
      const byLabel = {};
      for (const row of rangeRows) {
        const vol = row.vol_org.toLowerCase();
        let label;
        if (vol.startsWith('jst')) label = 'JST';
        else if (vol === 'ot') label = 'OT';
        else if (vol === 'nt') label = 'NT';
        else if (/^\d/.test(vol)) label = row.vol_org;  // e.g. "1835" volume
        else label = row.src_book_title;  // e.g. "Moses", "Abraham"
        if (!byLabel[label]) byLabel[label] = [];
        byLabel[label].push(row);
      }

      // Synthetic or whole-chapter headings use chapter-level slug (no verse range) for DST
      const useChapterSlug = range.synthetic || range.wholeChapter;
      // DST slug: zero-length sections use extended lastVerse (matches h3 display and includes next verse);
      // normal sections use rangeLastVerse (non-extended, avoids bleeding into next section)
      const dstLastVerse = range.zeroLength ? (range.lastVerse ?? range.rangeLastVerse) : (range.rangeLastVerse ?? range.lastVerse);
      const dstSlug = useChapterSlug
        ? `${versionPrefix}${range.bookSlug}.${range.chapter}`
        : `${versionPrefix}${range.bookSlug}.${range.chapter}.${range.firstVerse}-${dstLastVerse}`;
      const parts = [];
      for (const [label, labelRows] of Object.entries(byLabel)) {
        const first = labelRows[0];
        // src book slug: "JST John" → "jst.john", "Gen." → "gen", "1 Ne." → "1ne"
        // Use space→dot for multi-word (JST John → jst.john), strip periods
        const srcBookSlug = first.src_book_slug.toLowerCase().replace(/\./g, '').replace(/\s+/g, '.');
        let srcSlug;
        if (range.synthetic || range.wholeChapter) {
          // Whole-chapter parallel: deduplicate, sort, then check if contiguous covering full chapter
          const verses = [...new Set(labelRows.map(r => r.src_verse))].sort((a, b) => a - b);
          const chapterSize = chapterSizeMap[`${first.src_book_id}:${first.src_chapter}`] ?? 0;
          const isWholeChapter = chapterSize > 0 && verses[0] === 1 && verses.length === chapterSize && verses.every((v, i) => i === 0 || v === verses[i - 1] + 1);
          if (isWholeChapter) {
            srcSlug = `${srcBookSlug}.${first.src_chapter}`;
          } else {
            // Build comma-separated contiguous segments for non-contiguous ranges
            const segments = [];
            let segStart = verses[0], segEnd = verses[0];
            for (let i = 1; i < verses.length; i++) {
              if (verses[i] === segEnd + 1) { segEnd = verses[i]; }
              else { segments.push(`${segStart}-${segEnd}`); segStart = segEnd = verses[i]; }
            }
            segments.push(`${segStart}-${segEnd}`);
            srcSlug = `${srcBookSlug}.${first.src_chapter}.${segments.join(',')}`;
          }
        } else {
          // Sort src verses and handle non-contiguous ranges with comma-separated segments
          const srcVerses = [...new Set(labelRows.map(r => r.src_verse))].sort((a, b) => a - b);
          if (srcVerses.length === 1) {
            srcSlug = `${srcBookSlug}.${first.src_chapter}.${srcVerses[0]}`;
          } else {
            const segs = [];
            let segStart = srcVerses[0], segEnd = srcVerses[0];
            for (let i = 1; i < srcVerses.length; i++) {
              if (srcVerses[i] === segEnd + 1) { segEnd = srcVerses[i]; }
              else { segs.push(segStart === segEnd ? `${segStart}` : `${segStart}-${segEnd}`); segStart = segEnd = srcVerses[i]; }
            }
            segs.push(segStart === segEnd ? `${segStart}` : `${segStart}-${segEnd}`);
            srcSlug = `${srcBookSlug}.${first.src_chapter}.${segs.join(',')}`;
          }
        }
        parts.push(`${label}*${dstSlug}~${srcSlug}`);
      }
      if (parts.length) result[range.from] = parts.join('|');
    }
    return result;
  }

  // Mirrors PHP scriptutil::hasAudio($verse_list, $version)
  // audio=1 in DB → always has audio; audio=2 → only Isaiah and Book of Mormon; audio=0 → none
  async hasAudio(verseIds, version) {
    if (!verseIds || verseIds.length === 0) return 0;
    const rows = await db.query('SELECT audio FROM scripture_versions WHERE id = ? LIMIT 1', [version]);
    const audio = rows[0]?.audio;
    if (!audio) return 0;
    const min = Math.min(...verseIds);
    const max = Math.max(...verseIds);
    // Book of Mormon
    if (min >= 31103 && max <= 37706) return 1;
    // Isaiah (audio=2 versions only)
    if (min >= 17656 && max <= 18947 && audio === 2) return 1;
    if (audio === 1) return 1;
    return 0;
  }
}

export default new HeadingRepository();
