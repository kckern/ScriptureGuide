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

// A reference whose ";" pieces include a JST one ("john.3.16;jst.john.3.16"): the package reads
// no JST books, so it drops that piece; the lookup resolved it (result.sections, one per piece).
// The other pieces are the package's blocks; each JST piece is its section's block, and, as in
// PHP, a named piece after the first repeats its book ("JST John JST John 3:16"). null otherwise.
const JST_PIECE = /^\s*jst\b/i;
function withJstPieces(ref, result) {
  const pieces = String(ref ?? '').split(';');
  const jst = pieces.flatMap((p, i) => (JST_PIECE.test(p) ? [i] : []));
  const sections = result?.sections;
  if (!jst.length || pieces.length < 2 || pieces.some(p => !p.trim()) || sections?.length !== pieces.length) return null;
  const rest = pieces.filter((_, i) => !jst.includes(i)).join(';');
  const blocks = rest.trim() ? metaFromRef(rest) : [];
  // the first remaining piece followed a JST one: PHP doubled its book too
  if (jst[0] === 0 && blocks[0] && /[a-z]/i.test(pieces.find((_, i) => !jst.includes(i)) || '')) {
    blocks[0] = { ...blocks[0], orig: `${blocks[0].book} ${blocks[0].orig}` };
  }
  for (const k of jst) {
    const r = sections[k]?.reference;
    if (!r?.verseIds?.length) return null;
    const book = (r.book || '').replace(/—/g, ' ');
    const orig = (r.normalized || '').replace(/—/g, ' ');
    blocks.splice(k, 0, { orig: k > 0 ? `${book} ${orig}` : orig, book, verse_ids: [...r.verseIds] });
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
