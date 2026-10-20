// Emulates how the Sphinx index (infra/sphinx/sphinx.conf) tokenizes and matches verse text:
// charset_table = 0..9, A..Z->a..z, _, a..z and Hangul; everything else separates words;
// morphology = stem_en with min_stemming_len = 3. A plain query matches when every query
// word's stem occurs in the verse (Sphinx's implicit AND).
import { stem } from './porterStemmer.js';

const TOKEN = /[0-9a-z_가-힣ᄀ-ᅙᅡ-ᆢᆨ-ᇹ]+/g;

export function tokenize(text) {
  return String(text ?? '').toLowerCase().match(TOKEN) || [];
}

const stemToken = t => (/^[a-z]+$/.test(t) && t.length >= 3 ? stem(t) : t);

export function queryStems(query) {
  return [...new Set(tokenize(query).map(stemToken))];
}

export function matchesAll(text, stems) {
  if (!stems.length) return false;
  const have = new Set(tokenize(text).map(stemToken));
  return stems.every(s => have.has(s));
}

// The longest prefix every word with this stem shares, for a coarse SQL prefilter.
// Porter may rewrite the stem's last letter (happy → happi), so drop it when the stem is long enough.
export function stemPrefix(s) {
  return s.length > 3 ? s.slice(0, -1) : s;
}
