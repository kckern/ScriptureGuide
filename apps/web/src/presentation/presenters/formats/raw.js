// raw.scripture.guide: inc_raw.php → scriptures::renderRaw. Source verse markup keyed by verse_id,
// sent as text/plain but encoded as json_encode(PRETTY_PRINT) without NUMERIC_CHECK (ids stay strings).
// The version is the first one named in the path, else LDS (no range default). ?red_letter[] had no
// effect on the PHP site (scriptutil::loadWords returned [] before querying), so it is ignored.
import rawRepository from '../../../data/repositories/RawRepository.js';
import { phpJson } from '../../legacy/phpJson.js';
import { blocksFor } from './meta.js';
import { blockVerseIds } from '../../legacy/passages.js';

const HEADING_SKIP = new Set(['id', 'version', 'prev_id', 'verse_id']);

export async function rawData(lr, result, repo = rawRepository) {
  const version = (lr.versionList ?? Object.entries(lr.versions || {}))[0]?.[0] || 'LDS';
  const blocks = blocksFor(lr.ref, result);
  // renderRaw array_merge'd the blocks' verse_ids: one that is not an array (false, a junk piece
  // after a cross-book range) made the list null and the query fail, so the output was null
  if (blocks.some(b => !Array.isArray(b.verse_ids))) return null;
  const ids = blocks.flatMap(blockVerseIds);
  const rows = await repo.findRawVerses(version, ids);
  if (!rows.length) return null;

  const output = {};
  for (const row of rows) {
    const entry = {};
    if (/[§▲]/u.test(row.text)) {
      const h = await repo.loadHeading(row.verse_id, [version], '§¶');
      const headings = Object.fromEntries(Object.entries(h || {}).filter(([k]) => !HEADING_SKIP.has(k)));
      if (Object.keys(headings).length) entry.headings = headings;
    }
    output[row.verse_id] = Object.assign(output[row.verse_id] || {}, entry, {
      verse_id: row.verse_id,
      verse: row.verse,
      format: row.format,
      text: row.text,
    });
  }
  return output;
}

export class RawPresenter {
  async present(result, req, res) {
    const data = await rawData(req.config.legacy, result);
    res.type('text/plain').send(phpJson(data));
  }
}

export default new RawPresenter();
