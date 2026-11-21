// The v1 search object: canon order, PER_PAGE results a page, match offsets instead of markup.
import searchService, { volumeRange } from '../../services/SearchService.js';
import { slugifyRef } from '../../domain/rules/legacyReference.js';
import { highlightOffsets } from './text.js';

export const PER_PAGE = 50;
const API = 'https://api.scripture.guide/v1/search';
const SITE = 'https://scripture.guide';

// The site's search page: /search/{terms}, /{version}/{terms} or /{volume}/{terms}, words
// joined by dots. The site reads /{version}/{terms} as a search only when the terms have no
// digit (otherwise as a reference), so terms with a digit get the unscoped /search/ page.
function webLink(terms, version, volume) {
  const scoped = !/\d/.test(terms);
  const scope = scoped && version ? version.toLowerCase() : (scoped && volume) || 'search';
  return `${SITE}/${scope}/${terms.split(' ').map(encodeURIComponent).join('.')}`;
}

export async function buildSearch({ terms, version, volume, page }, { search = searchService } = {}) {
  // forcedVersion is a version or a volume word, not both: with both, the version is forced and
  // the volume becomes the range searched. requeryForced keeps a broad search in the version
  // asked for (the site falls back to LDS/KJV).
  const opts = version && volume
    ? { forcedVersion: version, range: volumeRange(volume), requeryForced: true }
    : { forcedVersion: version ?? volume ?? null, requeryForced: true };
  // match() finds every hit; only the page asked for is read and highlighted
  // Picks come in canon order by their verse (pick.key): a Book of Commandments or 1835 D&C hit
  // (ids 89431+) sits with the D&C verse it stands for, so don't sort by verse_id
  const result = await search.match(terms, opts);
  const picks = result.picks;

  const total = picks.length;
  const start = (page - 1) * PER_PAGE;
  const rows = await search.hydrate(result.query, picks.slice(start, start + PER_PAGE));
  const results = rows.map(r => ({
    id: r.verse_id,
    reference: r.ref,
    slug: slugifyRef(r.refShort),
    version: r.version,
    text: r.text,
    highlights: highlightOffsets(r.highlighted),
  }));

  const scopePath = [version?.toLowerCase(), volume].filter(Boolean).join('/');
  const termsPath = terms.split(' ').map(encodeURIComponent).join('+');
  const next = start + PER_PAGE < total ? `${API}/${scopePath ? `${scopePath}/` : ''}page-${page + 1}/${termsPath}` : null;

  return {
    api: 'v1',
    query: terms,
    scope: { version, volume },
    total,
    // The fallback ran out of time or rows, or a result limit left verses out
    truncated: !!(result.truncated || result.capped),
    page,
    per_page: PER_PAGE,
    results,
    links: { next, web: webLink(terms, version, volume) },
  };
}
