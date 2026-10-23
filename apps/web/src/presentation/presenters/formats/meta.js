// meta.scripture.guide: the reference blocks of a query (index.php → inc_api.php with
// meta_only, returning only "meta"). JSON as PHP's json_encode(PRETTY_PRINT | NUMERIC_CHECK).
import rawRepository from '../../../data/repositories/RawRepository.js';
import { flag } from '../../formatOptions.js';
import { metaFromRef, bookOnlyBlock } from '../../legacy/meta.js';
import { bookOnlyQuery } from '../../../domain/rules/referenceParsing.js';
import { sendPhpJson } from '../../legacy/phpJson.js';

// The blocks of a request: the package's reading of the reference; else the verses the lookup
// resolved (DB slugs); else, for a word alone that is a whole book name, its first chapter
// (result.bookOnly, resolved by the controller); else the PHP site's blocks for a reference
// that found nothing (result.legacyBlocks, built by the controller).
function blocksFor(ref, result) {
  const blocks = withJstPieces(ref, result) ?? metaFromRef(ref);
  if (blocks.length) return blocks;
  const r = result?.reference;
  if (r?.verseIds?.length) {
    return [{ orig: (r.normalized || '').replace(/—/g, ' '), book: (r.book || '').replace(/—/g, ' '), verse_ids: [...r.verseIds] }];
  }
  if (result?.bookOnly && bookOnlyQuery(ref)) return [bookOnlyBlock(result.bookOnly.book, result.bookOnly.verseIds)];
  return result?.legacyBlocks ?? [];
}

// A reference whose ";" pieces include a JST one ("john.3.16;jst.john.3.16;18"): the package reads
// no JST books and drops that piece, losing the running book after it. The lookup resolved every
// piece (result.sections, one per piece, a bare piece in the running book: "JST John 18"), so
// each block is its section, with PHP's orig: the first piece as given, a named piece after it
// with its book repeated ("JST John JST John 3:16", "John John 1:1"), a bare piece as its book and
// numbers ("JST John 18"). null otherwise.
const JST_PIECE = /^\s*jst\b/i;
function withJstPieces(ref, result) {
  const pieces = String(ref ?? '').split(';');
  const sections = result?.sections;
  if (pieces.length < 2 || !pieces.some(p => JST_PIECE.test(p)) || pieces.some(p => !p.trim()) || sections?.length !== pieces.length) return null;
  const blocks = [];
  for (const [k, piece] of pieces.entries()) {
    const r = sections[k]?.reference;
    if (!r?.verseIds?.length) return null;
    const book = (r.book || '').replace(/—/g, ' ');
    const orig = (r.normalized || '').replace(/—/g, ' ');
    const named = /[a-z]/i.test(piece);
    blocks.push({ orig: k > 0 && named ? `${book} ${orig}` : orig, book, verse_ids: [...r.verseIds] });
  }
  return blocks;
}

// inc_api.php meta_only branch, including ?heads (heading verse ids of the first block).
export async function metaOnly(req, result, repo = rawRepository) {
  const lr = req.config.legacy;
  const meta = blocksFor(lr.ref, result);
  if (flag(req, 'heads', { hostLabels: true }) && meta[0]) {
    const versions = (lr.versionList ?? Object.entries(lr.versions || {})).map(([v]) => v);
    const heads = new Map();
    for (const id of Array.isArray(meta[0].verse_ids) ? meta[0].verse_ids : []) {
      const h = await repo.loadHeading(id, versions, '§¶');
      const vid = h?.verse_id ?? null;
      heads.set(vid ?? '', vid);
    }
    meta[0].heads = [...heads.values()];
  }
  return meta;
}

export { blocksFor };

export class MetaPresenter {
  async present(result, req, res) {
    const lr = req.config.legacy;
    if (lr.ref.includes('~')) return res.status(200).type('text/html').send('');
    sendPhpJson(res, await metaOnly(req, result), { numericCheck: true });
  }
}

export default new MetaPresenter();
