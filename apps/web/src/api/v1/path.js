// The v1 URL path: /{api version}/{options...}/{translation}/{reference}, plus the parallel
// (a~b), search (/search/{scope...}/{terms}) and random (/random, /{translation}/random,
// /random/{volume}) forms. Pure: the caller passes the translations (ApiRepository.translations(),
// a Map of lower-case id → { id, name }).
import { ApiError } from './errors.js';

export const CURRENT_API = 1;
export const OPTIONS = Object.freeze(['html', 'ids']);
export const VOLUMES = Object.freeze(['ot', 'nt', 'bom', 'dc', 'pgp']);
export const RESERVED = Object.freeze([...OPTIONS, ...VOLUMES, 'search', 'random']);
const API_VERSION = /^v(\d+)$/i;
const PAGE = /^page-(\d+)$/i;

function decode(segment) {
  try { return decodeURIComponent(segment); } catch { return segment; }
}

// The stored id ("PRINTER" → "printer"), or null for an unknown one
function storedId(id, translations) {
  return translations.get(id.toLowerCase())?.id ?? null;
}

// "nrsv.kjv*lds" → ['NRSV', 'KJV'] in stored case; the "*format" part is layout only
function translationList(spec, translations) {
  const ids = spec.split('.').filter(Boolean).map(piece => piece.split('*')[0]);
  return ids.map(id => {
    const stored = storedId(id, translations);
    if (!stored) throw new ApiError('unknown_translation', `There is no translation "${id}".`);
    return stored;
  });
}

export function parseApiPath(path, translations) {
  const segs = String(path).split('/').filter(Boolean).map(decode);

  let api = CURRENT_API;
  const version = segs[0]?.match(API_VERSION);
  if (version) {
    api = Number(version[1]);
    segs.shift();
    if (api !== CURRENT_API) throw new ApiError('unsupported_api_version', `API version v${api} does not exist. The current version is v${CURRENT_API}.`);
  }

  const options = [];
  while (segs.length && OPTIONS.includes(segs[0].toLowerCase())) options.push(segs.shift().toLowerCase());

  const base = { api, options };
  const lower = segs.map(s => s.toLowerCase());

  if (lower[0] === 'search') return { ...base, kind: 'search', ...searchScope(segs.slice(1), translations) };

  if (lower[0] === 'random') return { ...base, kind: 'random', translations: [], volume: volumeOf(lower[1]) };
  if (lower[1] === 'random') {
    return { ...base, kind: 'random', translations: translationList(segs[0], translations), volume: volumeOf(lower[2]) };
  }

  const rest = segs.join('/');
  if (rest.slice(1).includes('~')) return { ...base, kind: 'parallel', query: rest };

  if (!segs.length) throw new ApiError('unparseable_reference', 'No reference was given.');
  if (segs.length === 1) return { ...base, kind: 'passage', translations: [], reference: segs[0] };
  return {
    ...base,
    kind: 'passage',
    translations: translationList(segs[0], translations),
    reference: segs.slice(1).join('; '),
  };
}

function volumeOf(word) {
  return word && VOLUMES.includes(word) ? word : null;
}

// /search/{translation?}/{volume?}/{page-n?}/{terms}: terms are the last segment
function searchScope(segs, translations) {
  if (!segs.length) throw new ApiError('empty_query', 'Search terms are empty.');
  const terms = segs[segs.length - 1].replace(/[+.]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!terms) throw new ApiError('empty_query', 'Search terms are empty.');
  const scope = { terms, translation: null, volume: null, page: 1 };
  for (const seg of segs.slice(0, -1)) {
    const word = seg.toLowerCase();
    const page = word.match(PAGE);
    const stored = storedId(seg, translations);
    if (page) scope.page = Math.max(1, Number(page[1]));
    else if (VOLUMES.includes(word)) scope.volume = word;
    else if (stored) scope.translation = stored;
    else throw new ApiError('unknown_translation', `There is no translation "${seg}".`);
  }
  return scope;
}
