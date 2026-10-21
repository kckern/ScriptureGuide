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

// Apache handed the path to PHP as the value of q (index.php?q=<path>), so a "+" in the
// path arrived as a space; "%2B" stays a "+".
function decode(path) {
  const spaced = String(path).replace(/\+/g, ' ');
  try { return decodeURIComponent(spaced); } catch { return spaced; }
}

// Version spec "kjv.1830*rebom" → [{ version: 'KJV', format: 'KJV' }, { version: '1830', format: 'REBOM' }]
// PHP kept the empty piece of "kjv." as a version ""; keepEmpty reproduces that for $cfig.
export function parseVersionSpec(spec, { keepEmpty = false } = {}) {
  const list = [];
  const pieces = String(spec).replace(/[;, -]+/g, '.').replace(/\.+/g, '.').split('.');
  for (const piece of pieces) {
    if (!piece && !keepEmpty) continue;
    const [text, format] = piece.split('*');
    const version = text.toUpperCase();
    const entry = { version, format: (format ?? text).toUpperCase() };
    const existing = list.findIndex(v => v.version === version);
    if (existing >= 0) list[existing] = entry; else list.push(entry);
  }
  return list;
}

// Strip the /api/ /img/ /mp3/ shortcuts (they set the subdomain) and one /<format>/ prefix.
function stripPathPrefixes(q, subdomain) {
  let pathFormat = null;
  for (const shortcut of PHP_PATH_SHORTCUTS) {
    const re = new RegExp(`^${shortcut}/`, 'i');
    if (re.test(q)) { q = q.replace(re, ''); subdomain = shortcut; }
  }
  const prefix = q.match(/^([a-z0-9]+)\//i);
  if (prefix && NODE_PATH_FORMATS.includes(prefix[1].toLowerCase())) {
    pathFormat = prefix[1];
    q = q.slice(prefix[0].length);
  }
  return { q, subdomain, pathFormat };
}

// "kjv/john.3.16/gen.1.1" → versionSpec "kjv", reference "john.3.16; gen.1.1"; "search/<terms>".
function splitInput(q) {
  const input = q.split('/');
  if (input[0] === 'search' && input[1]) return { search: true, reference: input[1], versionSpec: null };
  if (input.length === 1) return { search: false, reference: input[0], versionSpec: null };
  return { search: false, reference: input.slice(1).join('; '), versionSpec: input[0] };
}

// With JST among the versions, a reference that does not name JST is read as JST.
const withJst = reference =>
  (!/(jst|joseph smith)/i.test(reference) && /\d/.test(reference) ? 'jst ' + reference : reference);

// PHP request keys: "." and " " become "_".
const phpKey = k => k.replace(/[. ]/g, '_');

// The PHP site rewrote /<path>?<query> to index.php?q=<path>&<query>, so an "&" inside the
// (still encoded) path split it into request keys; flattenRequest put "d&c" back together.
function splitPathKeys(rawPath) {
  const [first, ...fragments] = rawPath.split('&');
  let q = decode(first);
  let previous = q;
  const keys = [];
  for (const fragment of fragments) {
    const eq = fragment.indexOf('=');
    const key = phpKey(decode(eq < 0 ? fragment : fragment.slice(0, eq)));
    const value = eq < 0 ? '' : decode(fragment.slice(eq + 1));
    if (/d\.*\s*$/i.test(previous) && /^c/i.test(key)) q += key.replace(/_/g, '.');
    else keys.push([key, value]);
    previous = key;
  }
  return { q: q.replace(/\. /g, ' '), keys };
}

/**
 * The request exactly as the PHP front controller saw it, for the formats that echo it (api
 * "input" and "config") or follow it (meta, raw, plain):
 *   q         the flattened q ("d&c.4" in the path → "dc.4"; "&flag" fragments removed)
 *   ref       PHP $ref: the subverse letter goes with the digit before it ("john.3.16a" → "john.3.1")
 *   versions  PHP $cfig['versions'], { VERSION: FORMAT } from the version path, or null
 *   config    PHP $cfig before lookup: path keys, then query keys (empty value → 1), then
 *             versions; null when empty
 */
function legacyRequest(rawPath, query) {
  const { q: flat, keys } = splitPathKeys(String(rawPath || '/').replace(/^\/+/, ''));
  let q = stripPathPrefixes(flat, '').q;
  if (q.startsWith('=/')) q = q.slice(2);
  q = q.replace(/\.(jpg|png)/gi, '');

  const config = {};
  for (const [key, value] of [...keys, ...Object.entries(query || {})]) {
    if (key !== 'q') config[key] = value !== '' ? value : 1;
  }

  const { reference, versionSpec } = splitInput(q);
  let versions = null;
  if (versionSpec !== null) {
    versions = {};
    for (const v of parseVersionSpec(versionSpec, { keepEmpty: true })) versions[v.version] = v.format;
    config.versions = versions;
  }
  let ref = reference.replace(/\d[a-z]$/i, '');
  if (versions && 'JST' in versions) ref = withJst(ref);
  return { q, ref, versions, config: Object.keys(config).length ? config : null };
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
  const { subdomain: hostSubdomain, flags: hostFlags } = parseHost(host);
  let q = decode(String(path || '/')).replace(/^\/+/, '');
  // index.php?q=... reaches the front controller without a rewritten path
  if (!q && typeof query?.q === 'string') q = query.q.replace(/^\/+/, '');

  const stripped = stripPathPrefixes(q, hostSubdomain);
  const subdomain = stripped.subdomain;
  q = stripped.q;
  const outputFormat = formatForSubdomain(stripped.pathFormat || subdomain);

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

  let { search, reference, versionSpec } = splitInput(q);
  let versions = versionSpec === null ? [] : parseVersionSpec(versionSpec);

  // Trailing subverse letter ("john.3.16a"). PHP's regex also drops the digit before
  // the letter; we keep it, since the rule's intent is to remove only the letter.
  // (legacy.ref keeps PHP's version for the formats that echo it.)
  reference = reference.replace(/(\d)[a-z]$/i, '$1');

  if (versions.some(v => v.version === 'JST')) reference = withJst(reference);

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
    legacy: legacyRequest(path, query),
  };
}

export default parseRequest;
