// The v1 URL path: /{api version}/{options...}/{version}/{reference}, plus the parallel
// (a~b), search (/search/{scope...}/{terms}), random (/random, /{version}/random,
// /random/{volume}) and version list (/versions) forms. Pure: the caller passes the versions
// (ApiRepository.versions(), a Map of lower-case id → { id, name, lang }).
// "Version" here means a scripture version (NRSV, 1830); the API's own version is the "api" field.
import { ApiError } from './errors.js';

export const CURRENT_API = 1;
export const OPTIONS = Object.freeze(['html', 'ids', 'verses']);
export const VOLUMES = Object.freeze(['ot', 'nt', 'bom', 'dc', 'pgp']);
export const RESERVED = Object.freeze([...OPTIONS, ...VOLUMES, 'search', 'random', 'versions']);
const API_VERSION = /^v([1-9]\d*)$/i; // v1, v2, …; "v01" and "v0" are not API versions
const PAGE = /^page-(\d+)$/i;

function decode(segment) {
  try { return decodeURIComponent(segment); } catch { return segment; }
}

// The stored id ("PRINTER" → "printer"), or null for an unknown one
function storedId(id, versions) {
  return versions.get(id.toLowerCase())?.id ?? null;
}

export const MAX_VERSIONS = 10;

// "nrsv.kjv*lds" → ['NRSV', 'KJV'] in stored case; the "*format" part is layout only.
// A version named twice is listed once.
function versionList(spec, versions) {
  const ids = spec.split('.').map(piece => piece.split('*')[0]).filter(Boolean);
  if (!ids.length) throw new ApiError('unknown_version', `"${spec}" names no version.`);
  const stored = [...new Set(ids.map(id => {
    const found = storedId(id, versions);
    if (!found) throw new ApiError('unknown_version', `There is no version "${id}".`);
    return found;
  }))];
  if (stored.length > MAX_VERSIONS) {
    throw new ApiError('reference_too_large', `Too many versions: ${stored.length}. Ask for ${MAX_VERSIONS} or fewer.`);
  }
  return stored;
}

export function parseApiPath(path, versions) {
  const segs = String(path).split('/').filter(Boolean).map(decode);

  let api = CURRENT_API;
  const apiVersion = segs[0]?.match(API_VERSION);
  if (apiVersion) {
    api = Number(apiVersion[1]);
    segs.shift();
    if (api !== CURRENT_API) throw new ApiError('unsupported_api_version', `API version v${api} does not exist. The current API version is v${CURRENT_API}.`);
  }

  const options = [];
  while (segs.length && OPTIONS.includes(segs[0].toLowerCase())) options.push(segs.shift().toLowerCase());

  const base = { api, options };
  const lower = segs.map(s => s.toLowerCase());

  if (lower[0] === 'search') return { ...base, kind: 'search', ...searchScope(segs.slice(1), versions) };

  if (lower[0] === 'versions' && segs.length === 1) return { ...base, kind: 'versions' };

  if (lower[0] === 'random') return { ...base, kind: 'random', versions: [], volume: volumeOf(lower[1]) };
  if (lower[1] === 'random') {
    return { ...base, kind: 'random', versions: versionList(segs[0], versions), volume: volumeOf(lower[2]) };
  }

  const rest = segs.join('/');
  // A "~" at the very start has no left side, so it can't be a parallel; let the lookup read it
  if (rest.slice(1).includes('~')) return { ...base, kind: 'parallel', query: rest };

  if (!segs.length) throw new ApiError('unparseable_reference', 'No reference was given.');
  if (segs.length === 1) {
    // "/nrsv/" or "/nrsv.kjv": versions and nothing to look up in them. A number alone is
    // a verse id ("/1830"), even where a version has that id.
    const pieces = segs[0].split('.').map(piece => piece.split('*')[0]);
    if (!/^\d+$/.test(segs[0]) && pieces.every(id => id && storedId(id, versions))) throw new ApiError('unparseable_reference', 'No reference was given after the version.');
    return { ...base, kind: 'passage', versions: [], reference: segs[0] };
  }
  return {
    ...base,
    kind: 'passage',
    versions: versionList(segs[0], versions),
    reference: segs.slice(1).join('; '),
  };
}

// The volume word after "random": none, or one of VOLUMES
function volumeOf(word) {
  if (!word) return null;
  if (VOLUMES.includes(word)) return word;
  throw new ApiError('unknown_volume', `There is no volume "${word}". Use one of ${VOLUMES.join(', ')}.`);
}

// /search/{version?}/{volume?}/{page-n?}/{terms}: terms are the last segment
function searchScope(segs, versions) {
  if (!segs.length) throw new ApiError('empty_query', 'Search terms are empty.');
  const terms = segs[segs.length - 1].replace(/[+.]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!terms) throw new ApiError('empty_query', 'Search terms are empty.');
  const scope = { terms, version: null, volume: null, page: 1 };
  for (const seg of segs.slice(0, -1)) {
    const word = seg.toLowerCase();
    const page = word.match(PAGE);
    const stored = storedId(seg, versions);
    if (page) scope.page = Math.max(1, Number(page[1]));
    else if (VOLUMES.includes(word)) scope.volume = word;
    else if (stored) scope.version = stored;
    else throw new ApiError('unknown_version', `Unknown search scope "${seg}". Use a version, a volume or page-<n>; the search terms go last.`);
  }
  return scope;
}
