// allow.json: intentional differences, reported as "allowed" instead of failing.
//   "<format> <path>": "reason"        one request
//   "<format> re:<regex>": "reason"    every path the regex matches (JavaScript syntax, unanchored)
//   "* re:<regex>": "reason"           the same, in every format
//   "<format> live:<regex>": "reason"  every request whose live body the regex matches (for live
//                                      responses that are broken whatever the path, e.g. a PHP fatal error)
//   "<format> re:<regex> && live:<regex>": "reason"   both: the path and the live body
//   "<format> re:<regex> && check:<name>": "reason"   both: the path and the check
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
  // PHP's /\d[a-z]$/ dropped the digit before a trailing subverse letter too; Node keeps it: every
  // line is equal, or live's is Node's with one digit removed
  subverseDigit: ({ live, node }) => {
    if (typeof live !== 'string' || typeof node !== 'string') return false;
    const l = live.split('\n'), n = node.split('\n');
    if (l.length !== n.length) return false;
    const oneDigitLess = (a, b) => b.length === a.length + 1 && [...b].some((ch, i) => /\d/.test(ch) && b.slice(0, i) + b.slice(i + 1) === a);
    return l.some((line, i) => line !== n[i]) && l.every((line, i) => line === n[i] || oneDigitLess(line, n[i]));
  },
  // PHP latex read the request's version only and dropped verses (JST) Node prints: every live
  // verse is in Node's output, and Node has more
  latexMissingVerses: ({ live, node }) => {
    if (typeof live !== 'string' || typeof node !== 'string') return false;
    const verses = text => [...text.matchAll(/\\versemarker\{\\thescriptureverse\}([^\\]*)/g)].map(m => m[1].trim());
    const l = verses(live), n = verses(node);
    return n.length > l.length && l.every(v => n.includes(v));
  },
};

const PATTERN = /^(\S+) (re|live):(.*)$/s;
const CHECK = /^(\S+) check:(\S+)$/;
const BOTH = /^(\S+) re:(.*?) && live:(.*)$/s;
const PATH_CHECK = /^(\S+) re:(.*?) && check:(\S+)$/s;

function compile(allow) {
  const patterns = [];
  for (const [key, reason] of Object.entries(allow)) {
    const pathCheck = key.match(PATH_CHECK);
    if (pathCheck) {
      try {
        if (CHECKS[pathCheck[3]]) patterns.push({ format: pathCheck[1], path: new RegExp(pathCheck[2]), check: CHECKS[pathCheck[3]], reason });
      } catch { /* ignored */ }
      continue;
    }
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
