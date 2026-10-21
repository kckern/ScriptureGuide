// Emulates how the Sphinx index (infra/sphinx/sphinx.conf) tokenizes and matches verse text:
// charset_table = 0..9, A..Z->a..z, _, a..z and Hangul; everything else separates words;
// morphology = stem_en with min_stemming_len = 3 (snowballEnglish.js). A plain query matches when every query
// word's stem occurs in the verse (Sphinx's implicit AND); a "quoted phrase" matches its words
// in order and adjacent (Sphinx phrase operator), which the live site passed through unchanged.
import { snowballStem as stem } from './snowballEnglish.js';

const TOKEN = /[0-9a-z_가-힣ᄀ-ᅙᅡ-ᆢᆨ-ᇹ]+/g;

export function tokenize(text) {
  return String(text ?? '').toLowerCase().match(TOKEN) || [];
}

// Stemming dominates the fallback's CPU time (every candidate verse is tokenized and stemmed), and
// the vocabulary is small, so stems are memoized; the memo is cleared if it ever grows past STEM_MEMO.
const STEM_MEMO = 200000;
const stems = new Map();
const stemToken = t => {
  if (t.length < 3 || !/^[a-z]+$/.test(t)) return t;
  let s = stems.get(t);
  if (s === undefined) {
    if (stems.size >= STEM_MEMO) stems.clear();
    s = stem(t);
    stems.set(t, s);
  }
  return s;
};

export function queryStems(query) {
  return [...new Set(tokenize(query).map(stemToken))];
}

// Query terms: each a list of stems, one for a word, several for a quoted phrase.
// '"hand of the lord" upon' → [['hand','of','the','lord'], ['upon']]. An unclosed quote runs to the end.
export function queryTerms(query) {
  const terms = [];
  String(query ?? '').split('"').forEach((part, i) => {
    const stems = tokenize(part).map(stemToken);
    if (i % 2) { if (stems.length) terms.push(stems); } else for (const s of stems) terms.push([s]);
  });
  return terms;
}

export function matchesAll(text, stems) {
  return matchesTerms(text, stems.map(s => [s]));
}

export function matchesTerms(text, terms) {
  if (!terms.length) return false;
  // A word can only have a query stem if it starts with that stem's prefix, so other words are
  // not stemmed: null never equals a stem.
  const prefixes = termPrefixes(terms);
  const words = tokenize(text).map(t => (prefixes.some(p => t.startsWith(p)) ? stemToken(t) : null));
  const have = new Set(words);
  return terms.every(term => (term.length === 1 ? have.has(term[0]) : words.some((w, i) => term.every((s, j) => words[i + j] === s))));
}

const prefixCache = new WeakMap();
function termPrefixes(terms) {
  if (!prefixCache.has(terms)) prefixCache.set(terms, [...new Set(terms.flat().map(stemPrefix))]);
  return prefixCache.get(terms);
}

// The longest prefix every word with this stem shares, for a coarse SQL prefilter.
// stem_en may rewrite the stem's last letter (happy → happi, day → dai) or add an e (aging → age,
// using → use), so drop the last letter when the stem is long enough, ends in that i, or is
// vowel-consonant-e; dying, lying and tying stem to die, lie and tie, and skies to sky.
// (Checked against every word of the full database: each starts with its stem's prefix.)
const RESPELLED = new Map([['die', 'd'], ['lie', 'l'], ['tie', 't'], ['sky', 'sk']]);
export function stemPrefix(s) {
  if (RESPELLED.has(s)) return RESPELLED.get(s);
  if (s.length > 3 || (s.length > 1 && s.endsWith('i'))) return s.slice(0, -1);
  if (s.length === 3 && /^[aeiou][^aeiou]e$/.test(s)) return s.slice(0, -1);
  return s;
}
