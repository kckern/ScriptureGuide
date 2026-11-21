// The v1 parallel object (a~b): two references side by side, aligned by ParallelService.
import parallelService, { parseSides } from '../../services/ParallelService.js';
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

// The version each side asks for, as ParallelService reads the query: "ver/ref", or for the left
// side a bare version ("1830~kjv/john.1", an edition of the right side's reference)
function askedVersions(query, names) {
  const sides = parseSides(query);
  if (!sides) return [];
  return ['left', 'right'].map(name => {
    const { ver, ref } = sides[name];
    const id = ver || (name === 'left' && names.has(ref.toLowerCase()) ? ref.toLowerCase() : '');
    return { name, ver, id, ref: ver || !id ? ref : sides.right.ref };
  });
}

export async function buildParallel(query, { parallel = parallelService, repo = apiRepository } = {}) {
  const names = await repo.versions();
  const asked = askedVersions(query, names);
  for (const { ver } of asked) {
    if (ver && !names.has(ver)) throw new ApiError('unknown_version', `There is no version "${ver}".`);
  }

  const page = await parallel.build(query);
  if (!page || !page.rows?.length) throw new ApiError('unparseable_reference', `"${query}" can't be read as two references to compare.`);
  const text = { left: query.split('~')[0], right: query.split('~').slice(1).join('~') };
  const found = { left: page.lver, right: page.rver };
  for (const { name, id, ref } of asked) {
    // A side with no verses has no version: its reference doesn't resolve
    if (!found[name]) throw new ApiError('unparseable_reference', `The ${name} side, "${text[name]}", finds no verses to compare.`);
    // ParallelService shows the default version (or the bare verse index) when the version asked
    // for has no text there
    if (id && found[name].toLowerCase() !== id) {
      throw new ApiError('not_in_version', `${names.get(id).id} has no text for the ${name} side, "${ref}".`);
    }
  }
  return {
    api: 'v1',
    query,
    left: { version: versionInfo(page.lver, names), reference: page.leftheader },
    right: { version: versionInfo(page.rver, names), reference: page.rightheader },
    rows: page.rows.map(row),
    links: { web: `${SITE}/${page.fullslug}` },
  };
}
