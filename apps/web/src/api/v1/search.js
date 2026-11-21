// The v1 search object: canon order, PER_PAGE results a page, match offsets instead of markup.
import searchService, { volumeRange } from '../../services/SearchService.js';
import { slugifyRef } from '../../domain/rules/legacyReference.js';
import { highlightOffsets } from './text.js';

export const PER_PAGE = 50;
const API = 'https://api.scripture.guide/v1/search';
const SITE = 'https://scripture.guide';

// The site's search page: /search/{terms}, /{version}/{terms} or /{volume}/{terms}, words
// joined by dots
function webLink(terms, version, volume) {
  const scope = version ? version.toLowerCase() : volume ?? 'search';
  return `${SITE}/${scope}/${terms.split(' ').map(encodeURIComponent).join('.')}`;
}

export async function buildSearch({ terms, version, volume, page }, { search = searchService } = {}) {
  // forcedVersion is a version or a volume word, not both: with both, the version is forced and
  // the volume becomes the range searched. requeryForced keeps a broad search in the version
  // asked for (the site falls back to LDS/KJV).
  const opts = version && volume
    ? { forcedVersion: version, range: volumeRange(volume), requeryForced: true }
    : { forcedVersion: version ?? volume ?? null, requeryForced: true };
  const result = await search.search(terms, opts);
  const rows = [...result.rows];
  rows.sort((a, b) => a.verse_id - b.verse_id);

  const total = rows.length;
  const start = (page - 1) * PER_PAGE;
  const results = rows.slice(start, start + PER_PAGE).map(r => ({
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
