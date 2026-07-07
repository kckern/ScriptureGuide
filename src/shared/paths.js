// Dotted-path get/set for binding form controls to the nested settings object,
// plus hostname-list parsing for the options textareas.

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// Mutates `obj` in place (callers pass a clone) and returns it.
export function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] = o[k] || {}), obj);
  target[last] = value;
  return obj;
}

// Normalize a textarea of hostnames: trim, lowercase, drop blanks, dedupe,
// preserve order.
export function parseHostList(text) {
  const seen = new Set();
  const out = [];
  for (const raw of String(text).split('\n')) {
    const h = raw.trim().toLowerCase();
    if (h && !seen.has(h)) { seen.add(h); out.push(h); }
  }
  return out;
}
