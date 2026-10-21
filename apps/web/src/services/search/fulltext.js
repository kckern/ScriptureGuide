// Prefiltering the search fallback's candidates with the MyISAM FULLTEXT index on
// scripture_verses.text instead of LIKE '%…%', which scans every row (about 2 s on the full
// database). MATCH(text) AGAINST('+fait*' IN BOOLEAN MODE) finds the rows with an indexed word
// starting with "fait" in milliseconds, but the index leaves out words shorter than
// ft_min_word_len and stopwords. A query stem goes to MATCH only when no such word can have it:
// the stem is at least ft_min_word_len long (a shorter word cannot stem to a longer stem) and is
// not the stem of a stopword. Every other stem stays a LIKE prefilter.
//
// The two tokenizers differ in one known way: MyISAM keeps letters outside a-z (é) and an inner
// apostrophe inside a word, where Sphinx splits. A Sphinx token that starts after such a letter
// ("Élohim" → "lohim") is not the start of a MyISAM word, so MATCH misses it. Non-ASCII stems stay
// with LIKE; the remaining gap is a stem of five or more letters right after an accented letter or
// an apostrophe, which the fallback may miss.
import { MYISAM_STOPWORDS } from './myisamStopwords.js';
import { queryStems, stemPrefix } from './matcher.js';

const stopStemCache = new WeakMap();
function stopStems(stopwords) {
  if (!stopStemCache.has(stopwords)) stopStemCache.set(stopwords, new Set(stopwords.flatMap(w => queryStems(w))));
  return stopStemCache.get(stopwords);
}

/**
 * One stem goes to MATCH: the one with the longest prefix, as the likeliest to be selective.
 * MyISAM evaluates each truncated term in full before intersecting, so two broad ones
 * ('+han* +lor*') take longer than LIKE; one selective term ('+charit*') narrows enough by itself.
 *
 * @param {string[]} stems query stems (matcher.queryStems)
 * @param {{minWordLen:number, stopwords:string[]}|null} settings from fulltextSettings; null: no index
 * @param {{minPrefix?:number}} [opts] shortest prefix worth a MATCH
 * @returns {{match: string|null, like: string[]}} a boolean-mode MATCH string, and LIKE prefixes
 */
export function fulltextPlan(stems, settings, { minPrefix = 1 } = {}) {
  let best = null;
  for (const s of stems) {
    const p = stemPrefix(s);
    const indexed = settings && /^[0-9a-z_]+$/.test(s) && s.length >= settings.minWordLen && !stopStems(settings.stopwords).has(s);
    if (indexed && p.length >= minPrefix && (!best || p.length > best.length)) best = p;
  }
  const like = [...new Set(stems.map(stemPrefix))].filter(p => p !== best);
  return { match: best ? `+${best}*` : null, like };
}

/**
 * What the FULLTEXT index on scripture_verses.text leaves out, or null when the fallback should
 * not use it: no such index, not MyISAM (InnoDB has other settings) or a custom stopword file.
 * A database error is thrown, not read as "no index".
 */
export async function fulltextSettings(db) {
  const [table] = await db.query(
    "SELECT ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scripture_verses'"
  );
  if (String(table?.engine).toLowerCase() !== 'myisam') return null;
  const indexes = await db.query(
    `SELECT INDEX_NAME AS index_name, COUNT(*) AS columns FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scripture_verses' AND INDEX_TYPE = 'FULLTEXT'
     GROUP BY INDEX_NAME HAVING SUM(COLUMN_NAME = 'text') = 1`
  );
  // MATCH(text) needs an index on exactly that column
  if (!indexes.some(i => Number(i.columns) === 1)) return null;
  const [vars] = await db.query('SELECT @@ft_min_word_len AS min, @@ft_stopword_file AS stop');
  const minWordLen = Number(vars?.min);
  if (!(minWordLen >= 1)) return null;
  if (vars.stop === '(built-in)') return { minWordLen, stopwords: MYISAM_STOPWORDS };
  if (vars.stop === '') return { minWordLen, stopwords: [] };
  return null;
}
