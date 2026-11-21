// The v1 passage object for a reference in one or more versions (design doc, "Response"
// and "Several versions").
import referenceService from '../../services/ReferenceService.js';
import apiRepository from '../../data/repositories/ApiRepository.js';
import { Reference } from '../../domain/entities/Reference.js';
import { defaultVersions } from '../../domain/rules/defaultVersions.js';
import { plainText } from '../../domain/rules/legacyText.js';
import { passageSlug } from '../../domain/rules/legacyReference.js';
import { formatReference } from '../../domain/rules/referenceParsing.js';
import { REQUEST_LIMITS } from '../../domain/rules/requestBudget.js';
import { ApiError } from './errors.js';
import { diagnoseMiss } from './diagnose.js';
import { copyrightFor } from './copyright.js';
import { languageFor } from './language.js';
import { passageHtml } from './html.js';

// passageSlug moved to legacyReference.js (the site's slugs use it too); kept here for callers
export { passageSlug };

const SITE = 'https://scripture.guide';

// The version object every response carries: { id, name, language, copyright }.
// versions is the Map from ApiRepository.versions().
export function versionInfo(id, versions) {
  const known = versions.get(String(id).toLowerCase());
  return { id: known?.id ?? id, name: known?.name ?? id, language: languageFor(known?.lang), copyright: copyrightFor(known?.id ?? id) };
}

// The pieces of a reference ("John 3:16; 4:1; Romans 8:28"), each with its own verse ids.
// A piece without a book name takes the book before it. The ids come from the whole
// reference, split where each piece's first verse appears, so together the pieces hold
// exactly the whole reference's ids in order. Looking a piece up by name is only used to
// find where it starts: the next piece is searched for after the previous piece's length,
// so overlapping pieces ("John 3:16-18; 3:17") split right. A piece whose start can't be
// found is dropped; its ids, if any, stay in the piece before it.
const tooManyPieces = n => new ApiError('reference_too_large', `The reference has ${n} pieces. Ask for ${REQUEST_LIMITS.pieces} or fewer.`);
const tooManyVerses = n => new ApiError('reference_too_large', `The reference has ${n} verses. Ask for ${REQUEST_LIMITS.verses} or fewer.`);
// After the lookup the count is a lower bound: each range stops at LOOKUP.maxVerses
const overVerseLimit = () => new ApiError('reference_too_large', `The reference has more than ${REQUEST_LIMITS.verses} verses. Ask for ${REQUEST_LIMITS.verses} or fewer.`);
// The package cuts a range at 1000 verses by default; one more than the limit lets a longer
// range show up as too large instead of coming back cut
const LOOKUP = Object.freeze({ maxVerses: REQUEST_LIMITS.verses + 1 });

// The limits checked on the text, before it is looked up: ";" separated pieces (the site
// counts only those; "," lists verses inside a piece), and for a verse id list
// ("1-500;900,902") the number of ids, counted without building them.
function checkQuerySize(query) {
  const pieceCount = String(query).split(';').filter(s => s.trim()).length;
  if (pieceCount > REQUEST_LIMITS.pieces) throw tooManyPieces(pieceCount);
  if (!/^[\d\s;,-]+$/.test(query)) return;
  let total = 0;
  for (const segment of String(query).split(/[;,]/).filter(s => s.trim())) {
    const [a, b] = segment.replace(/\s+/g, '').split('-').filter(Boolean).map(Number);
    total += b > a ? b - a + 1 : 1;
  }
  if (total > REQUEST_LIMITS.verses) throw tooManyVerses(total);
}

async function pieces(query, { refs, repo }) {
  // The same limits as the site's pages (RequestBudget)
  checkQuerySize(query);
  const whole = await refs.resolve(query, LOOKUP);
  if (whole.isEmpty) throw await diagnoseMiss(query, repo);
  // Only the verse limit applies here: a "," list typed as one piece comes back as one label
  // per verse, and the site counts pieces as typed (checkQuerySize)
  const labels = whole.normalized.split(';').map(s => s.trim()).filter(Boolean);
  if (whole.verseIds.length > REQUEST_LIMITS.verses) throw overVerseLimit();
  const ids = whole.verseIds;
  if (labels.length < 2) return [{ label: whole.normalized, ids }];
  const found = [];
  let book = '';
  for (const piece of labels) {
    const label = /[a-z]/i.test(piece) ? piece : `${book} ${piece}`;
    book = new Reference({ normalized: label }).book;
    const ref = await refs.resolve(label, LOOKUP);
    const length = Math.max(ref.verseIds.length, 1);
    const prev = found[found.length - 1];
    if (!prev) { found.push({ label, start: 0, length }); continue; }
    if (ref.isEmpty) continue;
    let start = ids.indexOf(ref.verseIds[0], prev.start + prev.length);
    if (start < 0) start = ids.indexOf(ref.verseIds[0], prev.start + 1);
    if (start > prev.start) found.push({ label, start, length });
  }
  return found.map((p, k) => ({ label: p.label, ids: ids.slice(p.start, found[k + 1]?.start ?? ids.length) }));
}

function referenceEntry(label, rows) {
  if (!rows.length) throw new ApiError('not_in_version', `No verses found for ${label}.`);
  const first = rows[0];
  const last = rows[rows.length - 1];
  return {
    label,
    book: first.book_title,
    slug: passageSlug(label, first.book_title_short, last.book_title_short),
    // Each end names its own book: a range can cross books ("Malachi 4:5 - Matthew 1:2")
    start: { book: first.book_title, chapter: first.chapter, verse: first.verse },
    end: { book: last.book_title, chapter: last.chapter, verse: last.verse },
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

// The passages scripture_references links to these verses: one entry per run of consecutive
// verses in one book ("JST John 3:16-18"), labelled from the index rows.
async function parallelsFor(ids, repo) {
  const sources = await repo.parallelSources(ids);
  const groups = [];
  for (const row of await repo.indexRows(sources)) {
    const last = groups[groups.length - 1]?.at(-1);
    if (last && Number(row.verse_id) === Number(last.verse_id) + 1 && row.book_id === last.book_id) groups[groups.length - 1].push(row);
    else groups.push([row]);
  }
  return groups.map(rows => {
    const reference = formatReference(rows[0].book_title, rows, false);
    return { reference, slug: passageSlug(reference, rows[0].book_title_short, rows.at(-1).book_title_short) };
  });
}

// The versions to use: the requested ones, or the first default (by verse range) with text
// at the first or last verse. fallback: no default had text, so LDS is used unchecked.
async function chooseVersions(requested, ids, repo) {
  if (requested.length) return { versions: requested, fallback: false };
  const ends = [...new Set([ids[0], ids[ids.length - 1]])];
  for (const { version } of defaultVersions([], ids)) {
    if ((await repo.verses(ends, version)).length) return { versions: [version], fallback: false };
  }
  return { versions: ['LDS'], fallback: true };
}

export async function buildPassage({ reference, versions: requested, options = [] }, { repo = apiRepository, refs = referenceService } = {}) {
  const names = await repo.versions();
  const parts = await pieces(reference, { refs, repo });
  const allIds = parts.flatMap(p => p.ids);
  const { versions, fallback } = await chooseVersions(requested, allIds, repo);
  const idsOnly = options.includes('ids');

  // Text per version, keyed by verse id (none with the ids option)
  const texts = {};
  if (!idsOnly) {
    for (const t of versions) {
      texts[t] = new Map((await repo.verses(allIds, t)).map(r => [Number(r.verse_id), plainText(r.text)]));
    }
  }
  if (!idsOnly && versions.every(t => texts[t].size === 0)) {
    const ref = parts.map(p => p.label).join('; ');
    throw new ApiError('not_in_version', fallback
      ? `No text found for ${ref} in the default version (${versions[0]}).`
      : versions.length > 1
        ? `None of ${versions.join(', ')} has text for ${ref}.`
        : `${versions[0]} has no text for ${ref}.`);
  }

  const rows = new Map((await repo.indexRows(allIds)).map(r => [Number(r.verse_id), r]));
  // Headings that start inside the passage, per version: verse id → text. Rows come in seq
  // order, so the last one for a verse wins (the narrower heading, as in headingAt).
  const startsAt = {};
  const starts = new Set();
  if (!idsOnly) {
    for (const t of versions) {
      startsAt[t] = new Map();
      for (const h of await repo.headingStarts(allIds, t)) {
        startsAt[t].set(Number(h.verse_id), h.text);
        starts.add(Number(h.verse_id));
      }
    }
  }

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
        for (const t of versions) {
          passage.headings[t] = startsAt[t].has(run[0])
            ? startsAt[t].get(run[0])
            : await repo.headingAt(run[0], rows.get(run[0])?.book_id, t);
        }
      }
      passage.verses = verses;
      if (options.includes('html') && !idsOnly) {
        passage.html = Object.fromEntries(versions.map(t => [t, passageHtml(passage, t)]));
      }
      passages.push(passage);
    }
  }

  const parallels = await parallelsFor(allIds, repo);
  const slug = parts.map(p => passageSlug(p.label, rows.get(p.ids[0])?.book_title_short, rows.get(p.ids.at(-1))?.book_title_short)).join(';');
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
