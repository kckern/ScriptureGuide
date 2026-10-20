// Request flags for format presenters, read the way PHP read $cfig: every query key, and every
// "&flag" fragment of the path (req.config.legacy.config), with an empty value meaning 1
// (so `?slides` is on and `?slides=0` is off). The api format also took host labels as flags
// (inc_api.php: api.heads.scripture.guide sets $cfig['heads'] = 1); pass { hostLabels: true }.
export function option(req, name, { hostLabels = false } = {}) {
  const config = req?.config;
  if (config) {
    if (hostLabels && config.hostFlags?.[name]) return 1;
    if (config.options?.[name] !== undefined) return config.options[name];
    if (config.legacy?.config?.[name] !== undefined) return config.legacy.config[name];
  }
  const q = req?.query?.[name];
  if (q === undefined) return undefined;
  if (Array.isArray(q)) return q[q.length - 1];
  return q === '' ? 1 : q;
}

// PHP truthiness (!empty) of a $cfig value: '', '0', 0, false, null, undefined are off.
export function flag(req, name, opts) {
  const v = option(req, name, opts);
  return !(v === undefined || v === null || v === false || v === '' || v === '0' || v === 0);
}

export default { option, flag };
