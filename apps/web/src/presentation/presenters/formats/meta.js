// meta.scripture.guide: the reference blocks of a query (index.php → inc_api.php with
// meta_only, returning only "meta"). JSON as PHP's json_encode(PRETTY_PRINT | NUMERIC_CHECK).
import rawRepository from '../../../data/repositories/RawRepository.js';
import { flag } from '../../formatOptions.js';
import { metaFromRef, bookOnlyBlock } from '../../legacy/meta.js';
import { blankHeading, bookOnlyQuery } from '../../../domain/rules/referenceParsing.js';
import { sendPhpJson } from '../../legacy/phpJson.js';

// Fallback for references the package cannot parse but the lookup resolved (DB slugs).
function blocksFor(ref, result) {
  const blocks = metaFromRef(ref);
  if (blocks.length || !result?.reference?.verseIds?.length) return blocks;
  const r = result.reference;
  return [{ orig: (r.normalized || '').replace(/—/g, ' '), book: (r.book || '').replace(/—/g, ' '), verse_ids: [...r.verseIds] }];
}

// inc_api.php meta_only branch, including ?heads (heading verse ids of the first block).
export async function metaOnly(req, result, repo = rawRepository) {
  const lr = req.config.legacy;
  const meta = blocksFor(lr.ref, result);
  // A word alone: a whole book name is its first chapter (result.bookOnly, resolved by the
  // controller); anything else is a block without verses, titled as cleanReference left it.
  if (!meta.length && bookOnlyQuery(lr.ref)) {
    if (result?.bookOnly) meta.push(bookOnlyBlock(result.bookOnly.book, result.bookOnly.verseIds));
    else {
      const name = blankHeading(lr.ref);
      meta.push({ orig: name, book: name, verse_ids: [] });
    }
  }
  if (flag(req, 'heads', { hostLabels: true }) && meta[0]) {
    const versions = Object.keys(lr.versions || {});
    const heads = new Map();
    for (const id of meta[0].verse_ids) {
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
