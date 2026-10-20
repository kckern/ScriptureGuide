// Request parsing rules of the PHP front controller (lib.php.inc), as pure functions.
//
// A request is <subdomain>.scripture.guide/<q>?<options>. The subdomain selects the
// output format; q holds an optional version spec and a reference (or search terms).

// Subdomains (and path shortcuts) that select an output format. Anything else renders HTML.
const SUBDOMAIN_FORMATS = Object.freeze({
  api: 'api',
  json: 'api',
  meta: 'meta',
  raw: 'raw',
  plain: 'plain',
  markdown: 'markdown',
  xml: 'xml',
  latex: 'latex',
  notes: 'notes',
  audio: 'audio',
  mp3: 'audio',
  cover: 'cover',
  hub: 'hub',
  slide: 'slide',
  img: 'img',
  imgc: 'imgc',
  fax: 'fax',
});

// PHP strips these path prefixes and treats them as the subdomain.
const PHP_PATH_SHORTCUTS = ['api', 'img', 'mp3'];
// The Node routes also accept /<format>/... for these formats.
const NODE_PATH_FORMATS = ['json', 'meta', 'raw', 'plain', 'markdown', 'xml', 'latex', 'notes', 'audio', 'cover'];

// Volume ranges used by q=random: OT, NT, Book of Mormon, D&C + PGP + Lectures.
const RANDOM_RANGES = [[1, 23145], [23146, 31102], [31103, 37706], [37707, 42599]];

export function formatForSubdomain(subdomain) {
  return SUBDOMAIN_FORMATS[String(subdomain || '').toLowerCase()] || 'html';
}

// "api.plain.scripture.guide" → { subdomain: 'api', flags: { plain: 1 } }
export function parseHost(host) {
  const labels = String(host || '').replace(/:\d+$/, '').split('.').filter(Boolean);
  const subdomain = (labels[0] || '').toLowerCase();
  const flags = {};
  if (labels.length > 3) {
    for (const label of labels.slice(1, -2)) flags[label] = 1;
  }
  return { subdomain, flags };
}

export function randomVerseId(random = Math.random) {
  const [min, max] = RANDOM_RANGES[Math.min(RANDOM_RANGES.length - 1, Math.floor(random() * RANDOM_RANGES.length))];
  return min + Math.min(max - min, Math.floor(random() * (max - min + 1)));
}

function decode(path) {
  try { return decodeURIComponent(path); } catch { return path; }
}

// Version spec "kjv.1830*rebom" → [{ version: 'KJV', format: 'KJV' }, { version: '1830', format: 'REBOM' }]
export function parseVersionSpec(spec) {
  const list = [];
  const pieces = String(spec).replace(/[;, -]+/g, '.').replace(/\.+/g, '.').split('.');
  for (const piece of pieces) {
    if (!piece) continue;
    const [text, format] = piece.split('*');
    const version = text.toUpperCase();
    const entry = { version, format: (format ?? text).toUpperCase() };
    const existing = list.findIndex(v => v.version === version);
    if (existing >= 0) list[existing] = entry; else list.push(entry);
  }
  return list;
}

/**
 * Parse a request the way lib.php.inc does.
 * @param {object} input
 * @param {string} input.host   Host header
 * @param {string} input.path   URL path (leading slash, possibly percent-encoded)
 * @param {object} input.query  parsed query string, in order
 * @param {Function} [input.random] RNG for q=random
 */
export function parseRequest({ host = '', path = '/', query = {}, random = Math.random } = {}) {
  let { subdomain, flags: hostFlags } = parseHost(host);
  let q = decode(String(path || '/')).replace(/^\/+/, '');

  for (const shortcut of PHP_PATH_SHORTCUTS) {
    const re = new RegExp(`^${shortcut}/`, 'i');
    if (re.test(q)) { q = q.replace(re, ''); subdomain = shortcut; }
  }
  let outputFormat = formatForSubdomain(subdomain);
  const prefix = q.match(/^([a-z0-9]+)\//i);
  if (prefix && NODE_PATH_FORMATS.includes(prefix[1].toLowerCase())) {
    outputFormat = formatForSubdomain(prefix[1]);
    q = q.slice(prefix[0].length);
  }

  // Options: every query key except q (empty value → 1). D&C split at "&" by a
  // query string is rejoined first (scriptutil::flattenRequest).
  const options = {};
  let previous = q;
  for (const [key, value] of Object.entries(query || {})) {
    if (key === 'q') continue;
    if (/d\.*\s*$/i.test(previous) && /^c/i.test(key)) {
      q += '&' + key.replace(/_/g, '.');
      previous = key;
      continue;
    }
    options[key] = value === '' || value == null ? 1 : value;
    previous = key;
  }
  q = q.replace(/\. /g, ' ');

  let cropped = false;
  if (q.startsWith('=/')) { cropped = true; q = q.slice(2); }
  q = q.replace(/\.(jpg|png)/gi, '');
  if (q === 'random') q = String(randomVerseId(random));

  const input = q.split('/');
  let search = false;
  let reference = '';
  let versions = [];
  let versionSpec = null;

  if (input[0] === 'search' && input[1]) {
    search = true;
    reference = input[1];
  } else if (input.length === 1) {
    reference = input[0];
  } else {
    versionSpec = input[0];
    versions = parseVersionSpec(versionSpec);
    reference = input.slice(1).join('; ');
  }

  // Trailing subverse letter ("john.3.16a"). PHP's regex also drops the digit before
  // the letter; we keep it, since the rule's intent is to remove only the letter.
  reference = reference.replace(/(\d)[a-z]$/i, '$1');

  if (versions.some(v => v.version === 'JST') && !/(jst|joseph smith)/i.test(reference) && /\d/.test(reference)) {
    reference = 'jst ' + reference;
  }

  if (reference && !/\d/.test(reference)) search = true;

  // ?version=X acts as the version when the path names none (scriptures::setConfigs).
  if (!versions.length && options.version && options.version !== 1) {
    versions = parseVersionSpec(String(options.version));
  }

  // Parallel request ("a~b"): the whole q is the reference; the parallel view parses it.
  let parallel = false;
  if (q.indexOf('~') > 0) {
    parallel = true;
    search = false;
    reference = q;
  }

  return {
    subdomain,
    hostFlags,
    outputFormat,
    options,
    q,
    reference,
    search,
    parallel,
    cropped,
    versions,
    versionSpec: parallel ? null : versionSpec,
  };
}

export default parseRequest;
