// The v1 parallel object (a~b): two references side by side, aligned by ParallelService.
import parallelService from '../../services/ParallelService.js';
import apiRepository from '../../data/repositories/ApiRepository.js';
import { ApiError } from './errors.js';
import { versionInfo } from './passage.js';

const SITE = 'https://scripture.guide';

// ParallelService texts are already flattened (arrayText); they start with a space and can
// hold runs of spaces where verses were joined
const clean = text => String(text ?? '').replace(/\s+/g, ' ').trim();

function side(cell) {
  if (cell.verseId === '' || cell.verseId == null) return null;
  return { verse_id: Number(cell.verseId), reference: cell.ref, text: clean(cell.text) };
}

// The row's CSS classes: "quote" or "allusion" when scripture_references links the two cells,
// "sidebyside" or "greyout" when it doesn't; "sig" marks a significant difference
function row(r) {
  const classes = r.className.split(/\s+/);
  const match = classes.includes('quote') ? 'quote' : classes.includes('allusion') ? 'allusion' : 'none';
  return { match, significant: classes.includes('sig'), left: side(r.left), right: side(r.right) };
}

export async function buildParallel(query, { parallel = parallelService, repo = apiRepository } = {}) {
  const page = await parallel.build(query);
  if (!page || !page.rows?.length) throw new ApiError('unparseable_reference', `"${query}" can't be read as two references to compare.`);
  // A side with no verses has no version (ParallelService reads none for "jst.john.3.16", for one)
  for (const [name, ver, text] of [['left', page.lver, query.split('~')[0]], ['right', page.rver, query.split('~').slice(1).join('~')]]) {
    if (!ver) throw new ApiError('unparseable_reference', `The ${name} side, "${text}", finds no verses to compare.`);
  }
  const names = await repo.versions();
  return {
    api: 'v1',
    query,
    left: { version: versionInfo(page.lver, names), reference: page.leftheader },
    right: { version: versionInfo(page.rver, names), reference: page.rightheader },
    rows: page.rows.map(row),
    links: { web: `${SITE}/${page.fullslug}` },
  };
}
