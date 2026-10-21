// Comparison and report logic for sphinx-vs-fallback.mjs, kept free of I/O for unit tests.
import { queryTerms, matchesTerms, tokenize, stemPrefix, stemToken } from '../../src/services/search/matcher.js';
import { plainText } from '../../src/domain/rules/legacyText.js';

export const MAX_SHOWN = 10;

// A query made only of quoted phrases: Sphinx's phrase operator and the fallback's adjacency check
// may differ on purpose, so these differences are reported apart and do not fail the run. A query
// with words outside the quotes ('"faith hope" charity') is a plain query.
export const isPhrase = q => /^(\s*"[^"]*("|$))+\s*$/.test(String(q));

const key = h => `${String(h.version).toUpperCase()}|${Number(h.verse_id)}`;

/**
 * Per-version set difference of two hit lists ([{verse_id, version}]).
 * @returns {Map<string, {a:number, b:number, onlyA:number[], onlyB:number[]}>} by version, in
 *   `versions` order then any other version seen; counts are distinct verse ids.
 */
export function diffSets(a, b, versions = []) {
  const byVersion = new Map(versions.map(v => [v.toUpperCase(), { a: new Set(), b: new Set() }]));
  const add = (hits, side) => {
    for (const h of hits) {
      const v = String(h.version).toUpperCase();
      if (!byVersion.has(v)) byVersion.set(v, { a: new Set(), b: new Set() });
      byVersion.get(v)[side].add(Number(h.verse_id));
    }
  };
  add(a, 'a');
  add(b, 'b');
  const out = new Map();
  for (const [v, { a: sa, b: sb }] of byVersion) {
    out.set(v, {
      a: sa.size,
      b: sb.size,
      onlyA: [...sa].filter(id => !sb.has(id)).sort((x, y) => x - y),
      onlyB: [...sb].filter(id => !sa.has(id)).sort((x, y) => x - y),
    });
  }
  return out;
}

export const hasDifference = diff => [...diff.values()].some(d => d.onlyA.length || d.onlyB.length);

/**
 * Production's first pass over all versions (SearchService.search, stopAfter REQUERY_OVER): past
 * `over` hits the results come from the per-range requery instead, and the fallback stops reading
 * soon after `over`, so two passes that both go past it agree whatever their sets. Otherwise the
 * first pass is the result, and its sets must match.
 * @returns {{requery:boolean, diff:Map, notes:string[]}}
 */
export function firstPass(sphinx, fallback, versions, over) {
  const a = sphinx.length > over, b = fallback.length > over;
  const diff = diffSets(sphinx, fallback, versions);
  const notes = [];
  if (a && b) for (const d of diff.values()) { d.onlyA = []; d.onlyB = []; }
  else if (a || b) notes.push(`first pass: only ${a ? 'sphinx' : 'fallback'} went past ${over} hits (sphinx ${sphinx.length}, fallback ${fallback.length})`);
  return { requery: a || b, diff, notes };
}

// The text's words that could carry a query stem, with their stems: "loving→love, loveth→loveth"
export function stemmedWords(text, query) {
  const prefixes = [...new Set(queryTerms(query).flat().map(stemPrefix))];
  const seen = new Map();
  for (const t of tokenize(plainText(text))) {
    if (seen.has(t) || !prefixes.some(p => t.startsWith(p))) continue;
    seen.set(t, stemToken(t));
  }
  return [...seen].map(([w, s]) => (w === s ? w : `${w}→${s}`)).join(', ');
}

// About `width` characters of the verse around its first word that could carry a query stem
export function snippet(text, query, width = 140) {
  const plain = plainText(text);
  if (plain.length <= width) return plain;
  const prefixes = [...new Set(queryTerms(query).flat().map(stemPrefix))];
  const lower = plain.toLowerCase();
  const at = Math.min(...prefixes.map(p => lower.search(new RegExp(`\\b${p.replace(/[^0-9a-z]/g, '')}`))).filter(i => i >= 0), Infinity);
  const start = Number.isFinite(at) ? Math.max(0, at - Math.floor(width / 3)) : 0;
  const end = Math.min(plain.length, start + width);
  return `${start ? '…' : ''}${plain.slice(start, end)}${end < plain.length ? '…' : ''}`;
}

/**
 * Why one side has a verse the other lacks, from the fallback matcher's view of the text:
 *  - only Sphinx, matcher matches: the fallback's SQL prefilter (FULLTEXT/LIKE) dropped it
 *  - only Sphinx, matcher does not match: tokenizer or stemmer disagree with Sphinx
 *  - only fallback: Sphinx does not match a verse the matcher accepts (tokenizer/stemmer)
 */
export function diagnose(text, query, side) {
  if (text == null) return 'no text for this verse in scripture_verses';
  const m = matchesTerms(plainText(text), queryTerms(query));
  if (side === 'sphinx') return m ? 'matcher accepts it: SQL prefilter missed it' : 'matcher rejects it: tokenizer/stemmer differs from Sphinx';
  return m ? 'matcher accepts it, Sphinx does not: tokenizer/stemmer differs' : 'matcher rejects it too: hit did not come from the matcher';
}

/**
 * Report lines for one query.
 * @param {object} r { query, label (which comparison), diff (diffSets(sphinx, fallback)),
 *   texts: Map 'VERSION|id' → text, notes: string[] }
 */
export function formatQuery({ query, label = '', diff, texts = new Map(), notes = [] }, max = MAX_SHOWN) {
  const lines = [];
  const differs = hasDifference(diff);
  lines.push(`${differs ? 'DIFF' : 'same'}  ${JSON.stringify(query)}${label ? `  [${label}]` : ''}`);
  for (const [v, d] of diff) {
    const n = d.onlyA.length + d.onlyB.length;
    lines.push(`  ${v.padEnd(5)} sphinx ${String(d.a).padStart(6)}  fallback ${String(d.b).padStart(6)}${n ? `  only sphinx ${d.onlyA.length}, only fallback ${d.onlyB.length}` : ''}`);
    for (const [side, ids] of [['sphinx', d.onlyA], ['fallback', d.onlyB]]) {
      for (const id of ids.slice(0, max)) {
        const text = texts.get(`${v}|${id}`);
        lines.push(`    only ${side.padEnd(8)} ${v} ${id}: ${diagnose(text, query, side)}`);
        if (text != null) {
          lines.push(`      words: ${stemmedWords(text, query) || '(none starting with a query stem)'}`);
          lines.push(`      text:  ${snippet(text, query)}`);
        }
      }
      if (ids.length > max) lines.push(`    … ${ids.length - max} more only on ${side}`);
    }
  }
  for (const n of notes) lines.push(`  note: ${n}`);
  return lines;
}

// The (version, verse_id) pairs whose text the report shows
export function shownPairs(diff, max = MAX_SHOWN) {
  const out = [];
  for (const [version, d] of diff) {
    for (const id of [...d.onlyA.slice(0, max), ...d.onlyB.slice(0, max)]) out.push({ version, verse_id: id });
  }
  return out;
}
