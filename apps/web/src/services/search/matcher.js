// Emulates how the Sphinx index (infra/sphinx/sphinx.conf) tokenizes and matches verse text:
// charset_table = 0..9, A..Z->a..z, _, a..z and Hangul; everything else separates words;
// morphology = stem_en with min_stemming_len = 3. A plain query matches when every query
// word's stem occurs in the verse (Sphinx's implicit AND); a "quoted phrase" matches its words
// in order and adjacent (Sphinx phrase operator), which the live site passed through unchanged.
import { stem } from './porterStemmer.js';

const TOKEN = /[0-9a-z_가-힣ᄀ-ᅙᅡ-ᆢᆨ-ᇹ]+/g;

export function tokenize(text) {
  return String(text ?? '').toLowerCase().match(TOKEN) || [];
}

const stemToken = t => (/^[a-z]+$/.test(t) && t.length >= 3 ? stem(t) : t);

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
  const words = tokenize(text).map(stemToken);
  const have = new Set(words);
  return terms.every(term => (term.length === 1 ? have.has(term[0]) : words.some((w, i) => term.every((s, j) => words[i + j] === s))));
}

// The longest prefix every word with this stem shares, for a coarse SQL prefilter.
// Porter may rewrite the stem's last letter (happy → happi), so drop it when the stem is long enough.
export function stemPrefix(s) {
  return s.length > 3 ? s.slice(0, -1) : s;
}
