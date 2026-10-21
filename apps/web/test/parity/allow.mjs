// allow.json: intentional differences, reported as "allowed" instead of failing.
//   "<format> <path>": "reason"        one request
//   "<format> re:<regex>": "reason"    every path the regex matches (JavaScript syntax, unanchored)
//   "* re:<regex>": "reason"           the same, in every format
//   "<format> live:<regex>": "reason"  every request whose live body the regex matches (for live
//                                      responses that are broken whatever the path, e.g. a PHP fatal error)
// An exact key wins over a pattern; patterns are tried in file order. Invalid regexes never match.

const PATTERN = /^(\S+) (re|live):(.*)$/s;

function compile(allow) {
  const patterns = [];
  for (const [key, reason] of Object.entries(allow)) {
    const m = key.match(PATTERN);
    if (!m) continue;
    try { patterns.push({ format: m[1], on: m[2], re: new RegExp(m[3]), reason }); } catch { /* ignored */ }
  }
  return patterns;
}

const cache = new WeakMap();

// The reason a request's difference is allowed, or undefined.
export function allowReason(allow, format, path, liveBody) {
  const exact = allow[`${format} ${path}`];
  if (exact) return exact;
  if (!cache.has(allow)) cache.set(allow, compile(allow));
  return cache.get(allow).find(p => (p.format === '*' || p.format === format) &&
    (p.on === 're' ? p.re.test(path) : typeof liveBody === 'string' && p.re.test(liveBody)))?.reason;
}
