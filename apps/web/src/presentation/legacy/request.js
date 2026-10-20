// The PHP front controller's view of a request (lib.php.inc), for the legacy data formats.
//
// The PHP site rewrote /<path>?<query> to index.php?q=<path>&<query>, so an "&" inside the path
// split it into request keys (flattenRequest put "d&c" back together), and the first path segment
// named the versions when there was more than one segment. The api format echoes the resulting
// $ref and $cfig back as "input" and "config", so they are reproduced here exactly.

const FORMAT_PREFIX = /^(api|json|meta|raw|plain)\//i;

const decode = s => { try { return decodeURIComponent(s); } catch { return s; } };

// PHP request keys: "." and " " become "_".
const phpKey = k => k.replace(/[. ]/g, '_');

function parsePath(rawPath) {
  const [first, ...fragments] = rawPath.replace(/^\/+/, '').split('&');
  let q = decode(first);
  let previous = q;
  const flags = [];
  for (const fragment of fragments) {
    const eq = fragment.indexOf('=');
    const key = phpKey(decode(eq < 0 ? fragment : fragment.slice(0, eq)));
    const value = eq < 0 ? '' : decode(fragment.slice(eq + 1));
    if (/d\.*\s*$/i.test(previous) && /^c/i.test(key)) q += key.replace(/_/g, '.');
    else flags.push([key, value]);
    previous = key;
  }
  return { q: q.replace(/\. /g, ' '), flags };
}

export function legacyRequest(req) {
  const parsed = parsePath(req.path || '/');
  let q = parsed.q.replace(FORMAT_PREFIX, '');
  if (q.startsWith('=/')) q = q.slice(2);
  q = q.replace(/\.(jpg|png)/gi, '');

  const config = {};
  for (const [key, value] of [...parsed.flags, ...Object.entries(req.query || {})]) {
    if (key === 'q') continue;
    config[key] = value !== '' ? value : 1;
  }

  const input = q.split('/');
  let ref;
  let versions = null;
  if (input.length >= 2 && !(input[0] === 'search' && input[1])) {
    versions = {};
    const spec = input[0].replace(/[;, -]+/g, '.').replace(/\.+/g, '.');
    for (const item of spec.split('.')) {
      const [version, format] = item.split('*');
      versions[version.toUpperCase()] = (format ?? version).toUpperCase();
    }
    config.versions = versions;
    ref = input.slice(1).join('; ');
  } else {
    ref = input.length >= 2 ? input[1] : input[0];
  }

  ref = ref.replace(/\d[a-z]$/i, '');
  if (versions && 'JST' in versions && !/(jst|joseph smith)/i.test(ref) && /\d/.test(ref)) ref = 'jst ' + ref;

  return {
    q,
    ref,
    versions,
    specified: versions !== null,
    config: Object.keys(config).length ? config : null,
  };
}

// Host labels between the format and the domain (api.heads.scripture.guide) were flags too.
function hostFlags(req) {
  const labels = (req.hostname || '').split('.');
  return labels.length > 3 ? labels.slice(1, -2) : [];
}

// A request flag such as ?meta_only, from the query, the path, host labels, or req.config.options.
export function hasFlag(req, name) {
  const options = req.config?.options;
  if (options && options[name] != null && options[name] !== false && options[name] !== 0) return true;
  if (hostFlags(req).includes(name)) return true;
  const config = legacyRequest(req).config;
  return !!config && config[name] != null && config[name] !== '' && config[name] !== 0 && config[name] !== '0';
}

export default legacyRequest;
