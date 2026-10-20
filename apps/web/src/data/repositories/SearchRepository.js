import db from '../db/connection.js';

// Volume display config: maps vol lds_org to tab label and display name
const VOL_CONFIG = {
  ot:   { label: 'Old Testament',          order: 1 },
  nt:   { label: 'New Testament',          order: 2 },
  bm:   { label: 'Book of Mormon',         order: 3 },
  dc:   { label: 'Doctrine & Covenants',   order: 4 },
  pgp:  { label: 'Pearl of Great Price',   order: 5 },
  lec:  { label: 'Lectures on Faith',      order: 6 },
  jsto: { label: 'JST Old Testament',      order: 7 },
  jstn: { label: 'JST New Testament',      order: 8 },
};

export class SearchRepository {
  // Search for verses matching all terms (word-boundary, case-insensitive).
  // Returns { results: [...], totals: { ot: N, nt: N, ... }, total: N, terms: [...] }
  async search(query, version = 'LDS') {
    const terms = query.toLowerCase().replace(/[.]/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return { results: [], totals: {}, total: 0, terms: [] };

    // Build WHERE conditions using word-boundary REGEXP
    const conditions = terms.map(() => 'LOWER(sv.text) REGEXP ?').join(' AND ');
    const regexps = terms.map(t => '\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    const params = [version, ...regexps];

    const rows = await db.query(
      `SELECT sv.verse_id, sv.text,
         v.chapter, v.verse AS verse_num,
         b.book_title_short AS book_short, b.book_title AS book_title,
         b.lds_org AS book_slug,
         vol.lds_org AS vol_org, vol.volume_id
       FROM scripture_verses sv
       JOIN lds_scriptures_verses v ON v.verse_id = sv.verse_id
       JOIN lds_scriptures_books b ON b.book_id = v.book_id
       JOIN lds_scriptures_volumes vol ON vol.volume_id = v.volume_id
       WHERE sv.version = ? AND ${conditions}
       ORDER BY vol.volume_id, v.verse_id`,
      params
    );

    // Count by volume
    const totals = {};
    for (const row of rows) {
      totals[row.vol_org] = (totals[row.vol_org] || 0) + 1;
    }

    return { results: rows, totals, total: rows.length, terms };
  }
}

export default new SearchRepository();
