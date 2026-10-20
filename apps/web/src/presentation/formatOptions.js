// Query flags for format presenters. The PHP front controller copied every query key into
// $cfig, with an empty value meaning 1 (so `?slides` is on and `?slides=0` is off).
// Request parsing may also collect them in req.config.options; both places are checked.
export function option(req, name) {
  const fromConfig = req?.config?.options?.[name];
  if (fromConfig !== undefined) return fromConfig;
  const q = req?.query?.[name];
  if (q === undefined) return undefined;
  if (Array.isArray(q)) return q[q.length - 1];
  return q === '' ? 1 : q;
}

// PHP truthiness of a $cfig value: '', '0', 0, false, null, undefined are off.
export function flag(req, name) {
  const v = option(req, name);
  return !(v === undefined || v === null || v === false || v === '' || v === '0' || v === 0);
}

// An api/meta flag such as ?meta_only: from the query, host labels (api.heads.scripture.guide,
// inc_api.php), or "&flag" path fragments (req.config.legacy.config).
export function hasFlag(req, name) {
  const config = req?.config || {};
  const options = config.options;
  if (options && options[name] != null && options[name] !== false && options[name] !== 0) return true;
  if (config.hostFlags?.[name]) return true;
  const legacy = config.legacy?.config;
  return !!legacy && legacy[name] != null && legacy[name] !== '' && legacy[name] !== 0 && legacy[name] !== '0';
}

export default { option, flag, hasFlag };
