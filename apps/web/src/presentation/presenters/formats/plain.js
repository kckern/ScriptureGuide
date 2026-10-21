// plain.scripture.guide: inc_plain.php → scriptures::renderText. Verse text with markup removed,
// blocks separated by a blank line. Without a version path, one lookup with the default versions;
// with one, a lookup per version (by its format name, as PHP iterated the values) joined by "\n".
// PHP called lookup with only {versions, plain}, so ?plain_reference never added the "Ref. " prefix.
import rawRepository from '../../../data/repositories/RawRepository.js';
import { resolveBlock } from '../../legacy/passages.js';
import { plainLine, plainPassage } from '../../../domain/rules/legacyText.js';
import { blocksFor } from './meta.js';


async function blockText(block, versions, repo) {
  if (!block.verse_ids.length) {
    // blankData: an h3 with the reference and a "not found" paragraph.
    return plainLine(' ' + block.orig) + '\n\n' + plainLine('No scripture verses found.');
  }
  const resolved = await resolveBlock(block, versions, repo);
  if (resolved) return plainPassage(resolved.rows);
  // plainData: the verse index text, one paragraph per verse.
  const rows = await repo.findIndexVerses(block.verse_ids);
  return rows.map(r => plainLine(String(r.verse_scripture).replace(/--/g, '&mdash;'))).join('');
}

export async function plainFor(blocks, versions, repo = rawRepository) {
  const parts = [];
  for (const block of blocks) parts.push(await blockText(block, versions, repo));
  return parts.join('\n\n').trim();
}

export class PlainPresenter {
  async present(result, req, res) {
    const lr = req.config.legacy;
    res.type('text/plain');
    if (lr.ref.includes('~')) return res.send('');
    const blocks = blocksFor(lr.ref, result);
    if (!lr.q.includes('/')) return res.send(await plainFor(blocks, null));
    const out = [];
    for (const [, format] of lr.versionList ?? Object.entries(lr.versions || {})) out.push(await plainFor(blocks, { [format]: format }));
    res.send(out.join('\n'));
  }
}

export default new PlainPresenter();
