import db from '../db/connection.js';

// Build comma-separated contiguous verse number ranges, e.g. [21,22,23,25,26] → "21-23,25-26"
function buildVerseRanges(nums) {
  if (!nums || !nums.length) return '';
  const segs = [];
  let s = nums[0], e = nums[0];
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] === e + 1) { e = nums[i]; }
    else { segs.push(s === e ? `${s}` : `${s}-${e}`); s = e = nums[i]; }
  }
  segs.push(s === e ? `${s}` : `${s}-${e}`);
  return segs.join(',');
}

// Build SRC slug from parallel rows, handling multi-chapter and non-consecutive ranges.
// Mirrors PHP's referenceFromVerseIds+slufigyRef behavior for src_verse_ids.
function buildSrcSlug(labelRows, chapterSizeMap) {
  // Deduplicate by src_verse_id and sort
  const rows = [...new Map(labelRows.map(r => [r.src_verse_id, r])).values()]
    .sort((a, b) => a.src_verse_id - b.src_verse_id);
  if (!rows.length) return '';
  const first = rows[0];
  const srcBookSlug = first.src_book_slug.toLowerCase().replace(/\./g, '').replace(/\s+/g, '.');

  // Split into consecutive segments: new segment when chapter changes AND verse_id is not consecutive
  // (mirrors PHP: segment splits on chapter change + non-consecutive id)
  const segments = [[rows[0]]];
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1], curr = rows[i];
    if (curr.src_chapter !== prev.src_chapter && curr.src_verse_id !== prev.src_verse_id + 1) {
      segments.push([curr]);
    } else {
      segments[segments.length - 1].push(curr);
    }
  }

  const segSlugs = segments.map(seg => {
    const chapters = [...new Set(seg.map(r => r.src_chapter))];
    if (chapters.length > 1) {
      // Consecutive verse_ids spanning multiple chapters (e.g. JST Matt 1-2)
      const minCh = chapters[0], maxCh = chapters[chapters.length - 1];
      const minV = seg[0].src_verse;
      const maxV = seg[seg.length - 1].src_verse;
      const maxChSize = chapterSizeMap[`${seg[0].src_book_id}:${maxCh}`] ?? 0;
      if (minV === 1 && maxChSize > 0 && maxV === maxChSize) {
        return `${srcBookSlug}.${minCh}-${maxCh}`;
      }
      // PHP uses compact cross-chapter format when:
      //   A) first chapter is whole + last chapter starts at verse 1 (partial end): "book.N-M.endVerse"
      //   B) first chapter is partial + last chapter starts at verse 1 (partial end): "book.N.startVerse-M.endVerse"
      // This applies when all intermediate chapters are also whole.
      {
        const firstCh = chapters[0], lastCh = chapters[chapters.length - 1];
        const firstChVerses = [...new Set(seg.filter(r => r.src_chapter === firstCh).map(r => r.src_verse))].sort((a, b) => a - b);
        const lastChVerses = [...new Set(seg.filter(r => r.src_chapter === lastCh).map(r => r.src_verse))].sort((a, b) => a - b);
        const firstChSize = chapterSizeMap[`${seg[0].src_book_id}:${firstCh}`] ?? 0;
        const firstChIsWhole = firstChSize > 0 && firstChVerses[0] === 1 && firstChVerses.length === firstChSize && firstChVerses.every((v, i) => i === 0 || v === firstChVerses[i - 1] + 1);
        const lastChStartsAtOne = lastChVerses[0] === 1;
        const allIntermediateWhole = chapters.slice(1, -1).every(ch => {
          const chSize = chapterSizeMap[`${seg[0].src_book_id}:${ch}`] ?? 0;
          const chV = [...new Set(seg.filter(r => r.src_chapter === ch).map(r => r.src_verse))].sort((a, b) => a - b);
          return chSize > 0 && chV[0] === 1 && chV.length === chSize && chV.every((v, i) => i === 0 || v === chV[i - 1] + 1);
        });
        const firstChContiguous = firstChVerses.every((v, i) => i === 0 || v === firstChVerses[i - 1] + 1);
        if (lastChStartsAtOne && allIntermediateWhole && firstChContiguous) {
          const endVerse = lastChVerses[lastChVerses.length - 1];
          if (firstChIsWhole) {
            // Case A: first whole, last partial-from-1 → "book.N-M.endVerse"
            return `${srcBookSlug}.${minCh}-${maxCh}.${endVerse}`;
          } else if (firstChVerses[0] !== 1) {
            // Case B: first contiguous partial (not from 1), last partial-from-1 → "book.N.startVerse-M.endVerse"
            return `${srcBookSlug}.${minCh}.${firstChVerses[0]}-${maxCh}.${endVerse}`;
          }
        }
      }
      // Partial cross-chapter (not whole chapters): split into per-chapter sub-slugs joined by ';'.
      // PHP outputs e.g. "gen.8.47,49-56;9.1-3" not "gen.8.47-9.3".
      // Strip book prefix from 2nd+ per-chapter sub-slugs (mirrors same-book segment prefix stripping).
      const perChSlugs = chapters.map(ch => {
        const chRows = seg.filter(r => r.src_chapter === ch);
        const chSize = chapterSizeMap[`${seg[0].src_book_id}:${ch}`] ?? 0;
        const verses = [...new Set(chRows.map(r => r.src_verse))].sort((a, b) => a - b);
        const isWhole = chSize > 0 && verses[0] === 1 && verses.length === chSize &&
          verses.every((v, i) => i === 0 || v === verses[i - 1] + 1);
        if (isWhole) return `${srcBookSlug}.${ch}`;
        if (verses.length === 1) return `${srcBookSlug}.${ch}.${verses[0]}`;
        return `${srcBookSlug}.${ch}.${buildVerseRanges(verses)}`;
      });
      const prefix = `${srcBookSlug}.`;
      return perChSlugs.map((s, i) => i === 0 ? s : (s.startsWith(prefix) ? s.slice(prefix.length) : s)).join(';');
    }
    // Single chapter
    const ch = chapters[0];
    const chSize = chapterSizeMap[`${seg[0].src_book_id}:${ch}`] ?? 0;
    const verses = [...new Set(seg.map(r => r.src_verse))].sort((a, b) => a - b);
    const isWholeChapter = chSize > 0 && verses[0] === 1 && verses.length === chSize &&
      verses.every((v, i) => i === 0 || v === verses[i - 1] + 1);
    if (isWholeChapter) return `${srcBookSlug}.${ch}`;
    if (verses.length === 1) return `${srcBookSlug}.${ch}.${verses[0]}`;
    return `${srcBookSlug}.${ch}.${buildVerseRanges(verses)}`;
  });

  // PHP omits the book prefix for subsequent segments in the same book (e.g. "isa.52.1-2;54.2")
  const result2 = [];
  for (let i = 0; i < segSlugs.length; i++) {
    if (i === 0) { result2.push(segSlugs[i]); continue; }
    // Strip srcBookSlug prefix from subsequent same-book segments
    const prefix = `${srcBookSlug}.`;
    result2.push(segSlugs[i].startsWith(prefix) ? segSlugs[i].slice(prefix.length) : segSlugs[i]);
  }
  return result2.join(';');
}

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

    const allIds = verseIdRanges.flatMap(r => r.ids && r.ids.length ? r.ids : (() => {
      const ids = [];
      for (let i = r.from; i <= r.to; i++) ids.push(i);
      return ids;
    })());
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

    // Batch-fetch chapter sizes for ALL src chapters referenced by any heading.
    // Used to determine if a src verse range covers the full chapter (→ chapter-level slug).
    const chapterSizeMap = {};
    const chaptersToFetch = [];
    for (const row of rows) {
      const key = `${row.src_book_id}:${row.src_chapter}`;
      if (!chapterSizeMap[key]) chaptersToFetch.push({ book_id: row.src_book_id, chapter: row.src_chapter, key });
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
      const rangeIdSet = range.ids && range.ids.length ? new Set(range.ids) : null;
      const rangeRows = rows.filter(r => rangeIdSet ? rangeIdSet.has(r.dst_verse_id) : (r.dst_verse_id >= range.from && r.dst_verse_id <= range.to));
      if (!rangeRows.length) continue;

      // Only output if at least one row is significant (PHP: $sig check)
      const hasSig = rangeRows.some(r => r.significant === 1);
      if (!hasSig) continue;

      // Group by label — use Map to preserve insertion order (matches PHP's array ordering).
      // JS plain objects sort integer-like keys first, breaking insertion order for e.g. "1835".
      // Label: UPPER(vol_org) with DC→D&C, JSTN/JSTO→JST replacements (mirrors PHP findParallelLabel).
      // Exception: PGP volumes use book_title_short (Moses, Abraham, etc.).
      const byLabel = new Map();
      for (const row of rangeRows) {
        let volLabel = row.vol_org.toUpperCase()
          .replace('JSTN', 'JST').replace('JSTO', 'JST').replace(/^DC$/, 'D&C');
        const label = volLabel === 'PGP' ? row.src_book_title : volLabel;
        if (!byLabel.has(label)) byLabel.set(label, []);
        byLabel.get(label).push(row);
      }

      // Whole-chapter headings use chapter-level slug (no verse range) for DST
      const useChapterSlug = range.wholeChapter;
      // Cross-chapter: either whole-passage multi-chapter (book.N-M) or section spanning chapters (book.N.v-M.w)
      const isMultiChapterDst = range.endChapter && range.endChapter !== range.chapter;
      // DST slug: build from actual verse numbers (handles missing-verse gaps like NRSV Mark 15:28)
      const dstVerseRangeStr = buildVerseRanges(range.verseNums);
      const endVerse = range.lastVerse ?? range.rangeLastVerse;
      const dstSlug = useChapterSlug
        ? isMultiChapterDst
          ? `${versionPrefix}${range.bookSlug}.${range.chapter}-${range.endChapter}`
          : `${versionPrefix}${range.bookSlug}.${range.chapter}`
        : range.dstSlugOverride
          ? `${versionPrefix}${range.dstSlugOverride}`
          : isMultiChapterDst
            ? (range.firstVerse === 1
                ? `${versionPrefix}${range.bookSlug}.${range.chapter}-${range.endChapter}.${endVerse}`
                : `${versionPrefix}${range.bookSlug}.${range.chapter}.${range.firstVerse}-${range.endChapter}.${endVerse}`)
            : `${versionPrefix}${range.bookSlug}.${range.chapter}.${dstVerseRangeStr || `${range.firstVerse}-${endVerse}`}`;
      const parts = [];
      for (const [label, labelRows] of byLabel.entries()) {
        const srcSlug = buildSrcSlug(labelRows, chapterSizeMap);
        parts.push(`${label}*${dstSlug}~${srcSlug}`);
      }
      if (parts.length) result[range.from] = parts.join('|');
    }
    return result;
  }

  // First and last verse_id for a book+chapter (from canonical verse table)
  async findChapterBounds(bookId, chapter) {
    const rows = await db.query(
      'SELECT MIN(verse_id) AS first, MAX(verse_id) AS last FROM lds_scriptures_verses WHERE book_id = ? AND chapter = ?',
      [bookId, chapter]
    );
    return rows[0]?.first ? { first: rows[0].first, last: rows[0].last } : null;
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
