// The v1 passage object for a reference in one or more versions (design doc, "Response"
// and "Several versions").
import referenceService from '../../services/ReferenceService.js';
import apiRepository from '../../data/repositories/ApiRepository.js';
import { Reference } from '../../domain/entities/Reference.js';
import { defaultVersions } from '../../domain/rules/defaultVersions.js';
import { plainText } from '../../domain/rules/legacyText.js';
import { slugifyRef } from '../../domain/rules/legacyReference.js';
import { REQUEST_LIMITS } from '../../domain/rules/requestBudget.js';
import { ApiError } from './errors.js';
import { diagnoseMiss } from './diagnose.js';
import { copyrightFor } from './copyright.js';
import { languageFor } from './language.js';
import { passageHtml } from './html.js';

const SITE = 'https://scripture.guide';

// The version object every response carries: { id, name, language, copyright }.
// versions is the Map from ApiRepository.versions().
export function versionInfo(id, versions) {
  const known = versions.get(String(id).toLowerCase());
  return { id: known?.id ?? id, name: known?.name ?? id, language: languageFor(known?.lang), copyright: copyrightFor(id) };
}

// The pieces of a reference ("John 3:16; 4:1; Romans 8:28"), each with its own verse ids.
// A piece without a book name takes the book before it. The ids come from the whole
// reference, split where each piece's first verse appears, so together the pieces hold
// exactly the whole reference's ids in order. Looking a piece up by name is only used to
// find where it starts; a piece whose start can't be found joins the piece before it.
async function pieces(query, { refs, repo }) {
  const whole = await refs.resolve(query);
  if (whole.isEmpty) throw await diagnoseMiss(query, repo);
  const labels = whole.normalized.split(';').map(s => s.trim()).filter(Boolean);
  // The same limits as the site's pages (RequestBudget)
  if (labels.length > REQUEST_LIMITS.pieces) {
    throw new ApiError('reference_too_large', `The reference has ${labels.length} pieces. Ask for ${REQUEST_LIMITS.pieces} or fewer.`);
  }
  if (whole.verseIds.length > REQUEST_LIMITS.verses) {
    throw new ApiError('reference_too_large', `The reference has ${whole.verseIds.length} verses. Ask for ${REQUEST_LIMITS.verses} or fewer.`);
  }
  const ids = whole.verseIds;
  if (labels.length < 2) return [{ label: whole.normalized, ids }];
  const found = [];
  let book = '';
  for (const [i, piece] of labels.entries()) {
    const label = /[a-z]/i.test(piece) ? piece : `${book} ${piece}`;
    book = new Reference({ normalized: label }).book;
    const from = found.length ? found[found.length - 1].start : -1;
    const ref = i === 0 ? null : await refs.resolve(label);
    const start = i === 0 ? 0 : (ref.isEmpty ? -1 : ids.indexOf(ref.verseIds[0], from + 1));
    if (start > from) found.push({ label, start });
    else found[found.length - 1].label += `; ${label}`;
  }
  return found.map((p, k) => ({ label: p.label, ids: ids.slice(p.start, found[k + 1]?.start ?? ids.length) }));
}

function referenceEntry(label, rows) {
  const first = rows[0];
  const last = rows[rows.length - 1];
  return {
    label,
    book: first.book_title,
    slug: slugifyRef(label),
    start: { chapter: first.chapter, verse: first.verse },
    end: { chapter: last.chapter, verse: last.verse },
  };
}

// Runs of verse ids: a new run where the ids jump or where a section heading starts.
// headingStarts is a Set, so a verse with several heading rows splits once.
function runs(ids, headingStarts) {
  const out = [];
  for (const [i, id] of ids.entries()) {
    if (i === 0 || id !== ids[i - 1] + 1 || headingStarts.has(id)) out.push([id]);
    else out[out.length - 1].push(id);
  }
  return out;
}

// The versions to use: the requested ones, or the first default (by verse range) with text
async function chooseVersions(requested, ids, repo) {
  if (requested.length) return requested;
  for (const { version } of defaultVersions([], ids)) {
    if ((await repo.verses(ids.slice(0, 1), version)).length) return [version];
  }
  return ['LDS'];
}

export async function buildPassage({ reference, versions: requested, options = [] }, { repo = apiRepository, refs = referenceService } = {}) {
  const names = await repo.versions();
  const parts = await pieces(reference, { refs, repo });
  const allIds = parts.flatMap(p => p.ids);
  const versions = await chooseVersions(requested, allIds, repo);
  const idsOnly = options.includes('ids');

  // Text per version, keyed by verse id (none with the ids option)
  const texts = {};
  if (!idsOnly) {
    for (const t of versions) {
      texts[t] = new Map((await repo.verses(allIds, t)).map(r => [Number(r.verse_id), plainText(r.text)]));
    }
  }
  if (!idsOnly && versions.every(t => texts[t].size === 0)) {
    throw new ApiError('not_in_version', `${versions.join(', ')} has no text for ${parts.map(p => p.label).join('; ')}.`);
  }

  const rows = new Map((await repo.indexRows(allIds)).map(r => [Number(r.verse_id), r]));
  const starts = new Set();
  if (!idsOnly) for (const t of versions) for (const h of await repo.headingStarts(allIds, t)) starts.add(Number(h.verse_id));

  const passages = [];
  for (const part of parts) {
    for (const run of runs(part.ids, starts)) {
      const verses = run.map(id => {
        const r = rows.get(id);
        const verse = { id, chapter: r?.chapter ?? null, verse: r?.verse ?? null };
        if (!idsOnly) verse.texts = Object.fromEntries(versions.map(t => [t, texts[t].get(id) ?? null]));
        return verse;
      });
      const passage = {};
      if (!idsOnly) {
        passage.headings = {};
        for (const t of versions) passage.headings[t] = await repo.headingAt(run[0], rows.get(run[0])?.book_id, t);
      }
      passage.verses = verses;
      if (options.includes('html') && !idsOnly) {
        passage.html = Object.fromEntries(versions.map(t => [t, passageHtml(passage, t)]));
      }
      passages.push(passage);
    }
  }

  const parallels = [];
  for (const id of await repo.parallelSources(allIds)) {
    const ref = await refs.resolve(String(id));
    if (!ref.isEmpty) parallels.push({ reference: ref.normalized, slug: slugifyRef(ref.normalized) });
  }

  const slug = parts.map(p => slugifyRef(p.label)).join(';');
  const prefix = requested.length ? `${requested.map(t => t.toLowerCase()).join('.')}/` : '';
  return {
    api: 'v1',
    query: reference,
    versions: versions.map(t => versionInfo(t, names)),
    reference: parts.map(p => referenceEntry(p.label, p.ids.map(id => rows.get(id)).filter(Boolean))),
    passages,
    parallels,
    links: { web: `${SITE}/${prefix}${slug}` },
  };
}
