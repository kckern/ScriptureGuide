// allow.json: intentional differences, reported as "allowed" instead of failing.
//   "<format> <path>": "reason"        one request
//   "<format> re:<regex>": "reason"    every path the regex matches (JavaScript syntax, unanchored)
//   "* re:<regex>": "reason"           the same, in every format
//   "<format> live:<regex>": "reason"  every request whose live body the regex matches (for live
//                                      responses that are broken whatever the path, e.g. a PHP fatal error)
//   "<format> re:<regex> && live:<regex>": "reason"   both: the path and the live body
//   "<format> check:<name>": "reason"  every request where the named check (CHECKS) passes on the
//                                      compared responses ({ live, node } canonical, plus what
//                                      run.mjs looked up for it): for a known live bug that Node
//                                      fixes, where only the fixed lines may differ
// An exact key wins over a pattern; patterns are tried in file order. Invalid regexes never match.
import { staleSectionHeading, singleHeadingDrops } from './normalize.mjs';

// check:<name> predicates: ({ live, node, ... }) => boolean
const CHECKS = {
  // Live heads a passage whose first verse starts a section with § with the section before it;
  // raw: the first verse's live raw-format entry (staleSectionVerse)
  staleSectionHeading: ({ live, node, raw }) => staleSectionHeading(live, node, raw) === node,
  // passage_script.php dropped the first verse of every later section (single_heading)
  // dropRaw: live's raw entries of the dropped verses (run.mjs singleHeadingRaw)
  singleHeadingDrop: ({ live, node, dropRaw }) => typeof live === 'string' && typeof node === 'string' && singleHeadingDrops(live, node, dropRaw),
};

const PATTERN = /^(\S+) (re|live):(.*)$/s;
const CHECK = /^(\S+) check:(\S+)$/;
const BOTH = /^(\S+) re:(.*?) && live:(.*)$/s;

function compile(allow) {
  const patterns = [];
  for (const [key, reason] of Object.entries(allow)) {
    const check = key.match(CHECK);
    if (check) {
      if (CHECKS[check[2]]) patterns.push({ format: check[1], check: CHECKS[check[2]], reason });
      continue;
    }
    const both = key.match(BOTH);
    const m = both ? null : key.match(PATTERN);
    try {
      if (both) patterns.push({ format: both[1], path: new RegExp(both[2]), live: new RegExp(both[3]), reason });
      else if (m) patterns.push({ format: m[1], [m[2] === 're' ? 'path' : 'live']: new RegExp(m[3]), reason });
    } catch { /* ignored */ }
  }
  return patterns;
}

const cache = new WeakMap();

// The reason a request's difference is allowed, or undefined. canonical: { live, node, ... },
// the compared texts and lookups, for check: keys.
export function allowReason(allow, format, path, liveBody, canonical) {
  const exact = allow[`${format} ${path}`];
  if (exact) return exact;
  if (!cache.has(allow)) cache.set(allow, compile(allow));
  return cache.get(allow).find(p => (p.format === '*' || p.format === format) &&
    (!p.path || p.path.test(path)) &&
    (!p.live || (typeof liveBody === 'string' && p.live.test(liveBody))) &&
    (!p.check || (canonical != null && p.check(canonical))))?.reason;
}
