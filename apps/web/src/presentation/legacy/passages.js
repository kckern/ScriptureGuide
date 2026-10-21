// Per-block passage loading shared by the legacy data formats (scriptures::scriptureData's
// version fallback), and the api format's HTML (scriptures::renderHTML wrappers around the
// passage HTML of the scripture page).
import rawRepository from '../../data/repositories/RawRepository.js';
import { passageHtml } from './passageHtml.js';
import { defaultVersions, blockReference } from './meta.js';

// The first version, in fallback order, that has text for the block: { version, rows } or null.
// verse_ids may be false (no book) or hold nulls (a multi-book range whose ends matched nothing).
export const blockVerseIds = block => (Array.isArray(block.verse_ids) ? block.verse_ids.filter(id => id != null) : []);

// A block PHP rendered as an empty section: verse ids listed, none of them a verse ([null]).
export const isEmptyRange = block => Array.isArray(block.verse_ids) && block.verse_ids.length > 0 && !blockVerseIds(block).length;

export async function resolveBlock(block, versions, repo = rawRepository) {
  if (!blockVerseIds(block).length) return null;
  for (const version of Object.keys(defaultVersions(versions, block.verse_ids))) {
    const rows = await repo.findVersesInOrder(version, block.verse_ids);
    if (rows.length) return { version, rows };
  }
  return null;
}

// scriptures::renderHTML with the default wrappers: one section per block, <hr> between them.
// Returns { html, versions } where versions[i] is the version block i was rendered in ("" if none).
export async function scripturesHtml(req, res, blocks, versions) {
  let html = "<div class='scriptures'>";
  const used = [];
  for (const [i, block] of blocks.entries()) {
    if (i > 0) html += "\n\t<hr class='sectionbreak'/>";
    html += "\n\t<div class='section'>";
    const resolved = await resolveBlock(block, versions);
    used.push(resolved?.version ?? '');
    if (!resolved && isEmptyRange(block)) {
      // scriptureData of nothing: the section stays empty
    } else if (!resolved) {
      html += `\n\t\t<div class='passage ver_'>\n\t\t\t<h3>\n\t\t\t${block.orig}\n\t\t\t</h3>` +
        "\n\t\t\t<p>\n\t\t\t<span class='verse'>No scripture verses found.</span>\n\t\t\t</p>\n\t\t</div>";
    } else {
      for (const inner of await passageHtml(req, res, blockReference(block), resolved.version)) {
        html += `\n\t\t<div class='passage ver_${resolved.version}'>`;
        html += inner.replace(/\s+$/, '');
        html += '\n\t\t</div>';
      }
    }
    html += '\n\t</div>';
  }
  html += '\n</div>';
  return { html, versions: used };
}
