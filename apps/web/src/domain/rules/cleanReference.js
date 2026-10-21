// scriptutil::cleanReference from the PHP site, as a pure function: the text the PHP site turned a
// request's reference into before splitting it into blocks ("john.3.16" → "John 3:16",
// "nephi-3-travels" → "1 Nephi 3-travels", "abc.php71" → "Abc Php 71"). The package reads
// real references; this port gives the headings and blocks PHP built for everything else.
//
// The two regex tables are copied from scriptutil.php in order. PHP applied the first with /iu and
// the second with /i inside \b...\.*\b. In PHP's double-quoted strings "${1} H" interpolated an
// undefined variable, so "([—-])h" became " H" (the dash is dropped); "$1" stayed a backreference.
// Not ported: Dhammapada verses above 26 (a database lookup in PHP).

// PHP ran the book table without /u, so its patterns matched bytes; on these ASCII patterns and
// the BMP dashes in their classes, matching UTF-16 code units in JS gives the same results.
/* eslint-disable no-useless-escape */
const NORMALIZE = [
  [String.raw`(?:the[. ])*Joseph[ .]Smith[']*s*[ .]Trans[.]*(?:lation)*[ .]*o*f*[,.––—− ]*`, "JST "],
  [String.raw`(first|1st|\bi\b)`, "1"],
  [String.raw`(second|2nd|\bii\b)`, "2"],
  [String.raw`(third|3rd|\biii\b)`, "3"],
  [String.raw`(fourth|4th|\biv\b)`, "4"],
  [String.raw`([0-9])th\b`, "$1"],
  [String.raw`([1-4])(st|nd|d|rd|th)\b`, "$1"],
  [String.raw`,*\s*\b(?:ch\b|chap(?:t*er)*s*)\.*\,*\s*(\d+)`, "$1"],
  [String.raw`,*\s*\b(?:sec\b|section)\.*\s*(\d+)`, "$1"],
  [String.raw`([0-9]),*\s*\b(?:chapt*ers*|ch|chptrs*)\.*,*\s*([0-9])`, "$1:$2"],
  [String.raw`([a-z]),*\s*\b(?:chapt*ers*|ch|chptrs*)\s*([0-9])`, "$1 $2"],
  [String.raw`[()]+`, " "],
  [String.raw`[\s.]*[–—−\-]+[\s.]*`, "-"],
  [String.raw`([;,])\s*and\s*`, "$1"],
  [String.raw`([0-9])[ .]*and[ .]*`, "$1,"],
  [String.raw`(\d)(\.|: )(\d)`, "$1:$3"],
  [String.raw`\s+(\d+)[-–—](\d+:\d+)`, " $1:1-$2"],
  [String.raw`(\d)([A-Z])`, "$1 $2"],
  [String.raw`(\d) ([A-Z])$`, "$1$2"],
  [String.raw`([0-9]),\s*([1-4]*\s*[a-z])`, "$1; $2"],
  [String.raw`([a-z]), ([0-9])`, "$1 $2"],
  [String.raw`\.`, " "],
  [String.raw` - `, " "],
  [String.raw`; `, ";"],
  [String.raw`: `, ":"],
  [String.raw`(\D)-(\d)`, "$1 $2"],
  [String.raw`([a-z]),`, "$1"],
  [String.raw`jst(,| of )`, "JST "],
  [String.raw`jst([a-z])`, "JST $1"],
  [String.raw`,\s*((?:\d+\s)*[a-z])`, "; $1"],
  [String.raw`\b\s*cf\.*\s*\b`, "; "],
  [String.raw`\bv*ve*r*s*e*s*\s*([0-9])`, ":$1"],
  [String.raw`(, *)*\bverses*\s*([0-9])`, ":$1"],
  [String.raw`\s*:`, ":"],
  [String.raw`;\s*:`, ":"],
  [String.raw`(\d+) *to *(\d+)`, "$1-$2"],
  [String.raw`([—-])h`, " H"],
  [String.raw`([—-])m\b`, " M"],
  [String.raw`([A-za-z])(\d)`, "$1 $2"],
  [String.raw`o([nf])`, "o$1"],
  [String.raw`([;,])`, "$1 "],
  [String.raw`(the )*book of`, ""],
];

const BOOKS = [
  [String.raw`gen\.*(?:esis)*`, "Genesis"],
  [String.raw`exo*\.*(?:dus)*`, "Exodus"],
  [String.raw`levi*t*\.*(?:icus)*`, "Leviticus"],
  [String.raw`num\.*(?:bers)*`, "Numbers"],
  [String.raw`deut\.*(?:eronomy)*`, "Deuteronomy"],
  [String.raw`josh\.*(?:ua)*`, "Joshua"],
  [String.raw`judg\.*(?:es)*`, "Judges"],
  [String.raw`rut*h*\.*`, "Ruth"],
  [String.raw`sam*u*\.*(?:el)*`, "Samuel"],
  [String.raw`ki*n*gs*\.*`, "Kings"],
  [String.raw`chr*o*n*\.*(?:icles)*`, "Chronicles"],
  [String.raw`ezr*\.*(?:a)*`, "Ezra"],
  [String.raw`neh\.*(?:emiah)*`, "Nehemiah"],
  [String.raw`esth*\.*(?:er)*`, "Esther"],
  [String.raw`job`, "Job"],
  [String.raw`ps\.*(?:a)*\.*(?:lm)*\.*(?:s)*`, "Psalms"],
  [String.raw`prov\.*(?:erbs)*`, "Proverbs"],
  [String.raw`eccl*\.*(?:esiastes)*`, "Ecclesiastes"],
  [String.raw`(the )*song*\.*(?: of solomon)*`, "Solomon's Song"],
  [String.raw`isa\.*(?:iah)*`, "Isaiah"],
  [String.raw`jer\.*(?:emiah)*`, "Jeremiah"],
  [String.raw`lame*n*t*\.*(?:ations)*`, "Lamentations"],
  [String.raw`eze*k*\.*(?:iel)*`, "Ezekiel"],
  [String.raw`dan\.*(?:iel)*`, "Daniel"],
  [String.raw`hos*\.*(?:ea)*`, "Hosea"],
  [String.raw`joel*\.*`, "Joel"],
  [String.raw`amos*\.*`, "Amos"],
  [String.raw`obad\.*(?:iah)*`, "Obadiah"],
  [String.raw`jon*\.*(?:ah)*`, "Jonah"],
  [String.raw`mic*\.*(?:ah)*`, "Micah"],
  [String.raw`nah*\.*(?:um)*`, "Nahum"],
  [String.raw`hab*\.*(?:akuk)*`, "Habakkuk"],
  [String.raw`zeph*\.*(?:aniah)*`, "Zephaniah"],
  [String.raw`hag\.*(?:gai)*`, "Haggai"],
  [String.raw`zech*\.*(?:ariah)*`, "Zechariah"],
  [String.raw`mal*\.*(?:achi)*`, "Malachi"],
  [String.raw`(?:mat*t*h*|mt)\.*(?:ew)*`, "Matthew"],
  [String.raw`m(ar)*k`, "Mark"],
  [String.raw`lu*k*e*\.*`, "Luke"],
  [String.raw`jo*h*n\.*`, "John"],
  [String.raw`(?:the )*act*s*\.*(?: of the apostles)*`, "Acts"],
  [String.raw`rom*\.*(?:ans)*`, "Romans"],
  [String.raw`cor\.*(?:inthians)*`, "Corinthians"],
  [String.raw`gal*a*\.*(?:tians)*`, "Galatians"],
  [String.raw`ephe*\.*(?:sians)*`, "Ephesians"],
  [String.raw`phili*p*\.*(?:ippians)*`, "Philippians"],
  [String.raw`colo*s*\.*(?:sians)*`, "Colossians"],
  [String.raw`thess*\.*(?:alonians)*`, "Thessalonians"],
  [String.raw`tim\.*(?:othy)*`, "Timothy"],
  [String.raw`tit*\.*(?:us)*`, "Titus"],
  [String.raw`philem*o*n*\.*`, "Philemon"],
  [String.raw`he\.*(?:b)*\.*(?:rews)*`, "Hebrews"],
  [String.raw`ja\.*(?:me)*s`, "James"],
  [String.raw`pet*\.*(?:er)*`, "Peter"],
  [String.raw`ju\.*(?:d)*\.*(?:e)*`, "Jude"],
  [String.raw`rev\.*(?:elation)*`, "Revelation"],
  [String.raw`ne\.*(?:phi)*`, "Nephi"],
  [String.raw`jac\.*(?:ob)*`, "Jacob"],
  [String.raw`en\.*(?:os)*`, "Enos"],
  [String.raw`jar\.*(?:om)*`, "Jarom"],
  [String.raw`om\.*(?:ni)*`, "Omni"],
  [String.raw`(?:the *)*w(?:ords)*[ _-]*o[ _-f]*m(?:ormon)*`, "Words of Mormon"],
  [String.raw`mos\.*(?:iah)*`, "Mosiah"],
  [String.raw`alma`, "Alma"],
  [String.raw`hela*\.*(?:a*man)*`, "Helaman"],
  [String.raw`eth\.*(?:er)*`, "Ether"],
  [String.raw`morm\.*(?:on)*`, "Mormon"],
  [String.raw`moro\.*(?:ni)*`, "Moroni"],
  [String.raw`d(?:octrine)*\.* *(?:&amp;|&|and)* *c(?:ovenants)*(?:\s*\bSec(?:tion)*)*\.*`, "Doctrine and Covenants"],
  [String.raw`dee and see`, "Doctrine and Covenants"],
  [String.raw`Moses`, "Moses"],
  [String.raw`Abra*\.*(?:ham)*`, "Abraham"],
  [String.raw`Jos(?:eph)*\.* Smith(?:[–—\- ]Matthew)`, "Joseph Smith Matthew"],
  [String.raw`Jos(?:eph)*\.* Smith(?:[–—\- ]History)`, "Joseph Smith History"],
  [String.raw`JS[—\-]*\s*[H]`, "Joseph Smith History"],
  [String.raw`JS[—\-]*\s*[M]`, "Joseph Smith Matthew"],
  [String.raw`a(?:rticles)*[ _-]*o[ _-f]*f(?:aith)*`, "Articles of Faith"],
  [String.raw`,* *jst`, "JST"],
  [String.raw`Jos(eph)*\.* Smith('s)* Translation,*( of)*\s*`, "JST"],
  [String.raw`([^;-]*?)\s*jst\s*`, "JST $1"],
  [String.raw`JST *,*[ —-]+`, "JST "],
  [String.raw`JST Genesis 0`, "Moses 1"],
  [String.raw`lect*(?:ures*)*(?: on faith)*\.*`, "Lectures on Faith"],
  [String.raw`l[ _-]*o*[ _-n]*f`, "Lectures on Faith"],
  [String.raw`bo*c\s*(\d+)`, "Book of Commandments $1"],
  [String.raw`(?:book of )*com(?:mandments)*`, "Book of Commandments"],
  [String.raw`l *on* *f`, "Lectures on Faith"],
  [String.raw`lec\.*(?:tures*)(?: on faith)*`, "Lectures on Faith"],
  [String.raw`(?:the )*(?:book of )*(?:the )*Law of the Lord`, "Law"],
  [String.raw`Law`, "The Law of the Lord"],
  [String.raw`tsp`, "The Sealed Portion"],
  [String.raw`the sealed portion`, "The Sealed Portion"],
  [String.raw`1\s*(?:st)*\s*v(?:ision)*`, "First Vision"],
  [String.raw`W\s*Moroni`, "Words of Moroni"],
  [String.raw`s(?:ealed)*.*?moses`, "Sealed Book of Moses"],
  [String.raw`3.*ne(phi)*(te)*.*?acts`, "Acts of the Three Nephites"],
  [String.raw`qur['’ ]*(an)*`, "Qur’an"],
  [String.raw`(?:al[ \-––])*qur'*’*ani*c*(?:verses*)*`, "Qur’an"],
  [String.raw`surah [a-z\-–’']*(?: |:|–|\-|v|vv|verses*)*`, "Qur’an"],
  [String.raw`al[ \-–][a-z\-–’']+(?: |:|–|\-|v|vv|verses*|ayab)*`, "Qur’an"],
  [String.raw`kor(an)*`, "Qur’an"],
  [String.raw`dh*p(ada)*`, "Dhammapada"],
  [String.raw`d(ha|ah)mm*(apada)*`, "Dhammapada"],
  [String.raw`b*h*(agavad)* *g(ita)*`, "Bhagavad Gita"],
  [String.raw`tao( *te* *ching)*`, "Tao Te Ching"],
  [String.raw`(Book of )+`, "Book of "],
  [String.raw`( on Faith)+`, " on Faith"],
  [String.raw`(Solomon's )+`, "Solomon's "],
];
/* eslint-enable no-useless-escape */

// Patterns that backtrack badly (\b3.*ne...*?acts is cubic, .*?moses quadratic) and can only
// match when a word is present: skipped without it.
const NEEDS = new Map([
  [String.raw`s(?:ealed)*.*?moses`, /moses/i],
  [String.raw`3.*ne(phi)*(te)*.*?acts`, /acts/i],
  [String.raw`(?:the )*(?:book of )*(?:the )*Law of the Lord`, /law of the lord/i],
]);
const compiled = (table, wrap) => table.map(([src, dst]) => [new RegExp(wrap(src), 'gi'), dst, NEEDS.get(src)]);
const NORMALIZE_RE = compiled(NORMALIZE, s => s);
const BOOKS_RE = compiled(BOOKS, s => `\\b${s}\\.*\\b`);
// For the backtracking audit in the tests
export const REGEX_TABLES = { NORMALIZE: NORMALIZE_RE, BOOKS: BOOKS_RE };

const SMALL_WORDS = new Set(['of', 'a', 'the', 'and', 'an', 'or', 'nor', 'but', 'is', 'if', 'then', 'else', 'when',
  'at', 'from', 'by', 'on', 'off', 'for', 'in', 'out', 'over', 'to', 'into', 'with']);

// PHP trim(): " \t\n\r\0\x0B" only
export const phpTrim = s => String(s).replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, '');
const lower = s => s.replace(/[A-Z]+/g, c => c.toLowerCase());
const ucwords = s => s.replace(/(^|[ \t\r\n\f\v])([a-z])/g, (m, sp, c) => sp + c.toUpperCase());

// utils::strtotitle: ucwords on every space-separated word but the small ones (the first word
// always), then "Jst" → "JST" and "Tsp" → "TSP" anywhere.
export function strToTitle(title) {
  return phpTrim(title)
    .split(' ')
    .map((word, i) => (i === 0 || !SMALL_WORDS.has(word) ? ucwords(word) : word))
    .join(' ')
    .replace(/Jst/g, 'JST')
    .replace(/Tsp/g, 'TSP');
}

// PHP 7 is_numeric: leading whitespace, a sign, decimals and an exponent; no trailing whitespace.
const isNumeric = s => /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(s);

// More verse ids than any reference holds: a longer numeric range reads as no verses.
const MAX_NUMERIC_IDS = 50000;

// PHP range($a, $b) for the numeric pieces: inclusive, either direction, "" counts as 0.
function phpRange(a, b) {
  const from = Number(a || 0);
  const to = Number(b || 0);
  if (!Number.isFinite(from) || !Number.isFinite(to) || Math.abs(to - from) >= MAX_NUMERIC_IDS) return null;
  const out = [];
  if (from <= to) for (let i = from; i <= to; i++) out.push(i);
  else for (let i = from; i >= to; i--) out.push(i);
  return out;
}

// The verse ids PHP read from an all-numeric reference ("26137", "1-3;7"), or null when the
// reference is not numeric. ids may be fractional ("1832 08" → 1832.08), matching no verse.
export function numericVerseIds(ref) {
  if (isEmpty(ref)) return null;
  const s = phpTrim(ref).split('..').join(';').replace(/(\d+) (\d+)/g, '$1.$2');
  if (!isNumeric(s.replace(/[;-]/g, ''))) return null;
  const ids = [];
  for (const segment of s.split(';')) {
    let range = segment.split('-');
    if (range.length < 2) range = [segment, segment];
    const r = phpRange(range[0], range[range.length - 1]);
    if (!r || ids.length + r.length > MAX_NUMERIC_IDS) return [];
    ids.push(...r);
  }
  return ids;
}

const isEmpty = ref => ref == null || ref === '' || ref === '0' || ref === false;

/**
 * cleanReference($ref) for a reference that is not all numeric. Returns false for an empty
 * reference (PHP empty()). An all-numeric reference was read as verse ids, turned into a
 * reference and cleaned again; callers check numericVerseIds() first (that needs the database).
 */
// Longer references are not cleaned: several patterns backtrack super-linearly, and PHP gave up
// on such input too (pcre.backtrack_limit made preg_replace return null, an empty reference).
export const MAX_CLEAN_LENGTH = 500;

export function cleanReference(input) {
  if (isEmpty(input)) return false;
  if (String(input).length > MAX_CLEAN_LENGTH) return false;
  let ref = phpTrim(input).split('..').join(';').replace(/(\d+) (\d+)/gi, '$1.$2');

  ref = ref.split(' ').join(' ');
  // Leading zeros (applied before the table)
  ref = ref.replace(/([a-z])[ .-]*0+/gi, '$1 ').replace(/^(\d+)-/i, '$1 ');
  for (const [re, dst, need] of NORMALIZE_RE) if (!need || need.test(ref)) ref = ref.replace(re, dst);

  ref = strToTitle(lower(ref));
  for (const [re, dst, need] of BOOKS_RE) if (!need || need.test(ref)) ref = ref.replace(re, dst);

  // Default to the 1st chapter, then to the 1st book
  ref = ref.replace(/(Words of Mormon|Articles of Faith|4 Nephi|Jarom|Enos|Omni|Obadiah|2 John|3 John|Philemon|Jude|First Vision|Joseph Smith—.+)\s+([2-9]|(\d\d+))/gi, '$1 1:$2');
  ref = ref.replace(/(^|;\s*)(Nephi|cor|kings|chron|thes|pet|tim)/gi, '$1 1 $2');
  ref = ref.replace(/\s+/g, ' ');
  // Sub-verses ("8 a" → "8a")
  ref = ref.replace(/(?<!^)(:\d+)\s*([a-z])/gi, (m, v, sub) => lower(v + sub));
  // Cross-chapter references that start with a whole chapter
  ref = ref.replace(/([a-z]\s*\d+)(-\d+:\d+)/gi, '$1:1$2');
  ref = ref.split('--').join(' ');
  // Commas are semicolons when there are no verses
  if (!ref.includes(':')) ref = ref.split(',').join(';');
  return phpTrim(ref);
}

export default cleanReference;
