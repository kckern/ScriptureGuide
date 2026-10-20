// Reference blocks ("meta") as the PHP site built them in scriptures::loadMetaFromRef, and the
// version fallback order from scriptures::defaultVersions.
import { lookupReference } from 'scripture-guide';

function lookupIds(ref) {
  try {
    return lookupReference(ref)?.verse_ids ?? [];
  } catch {
    return [];
  }
}

function normalize(ref) {
  try {
    return lookupReference(ref)?.ref ?? '';
  } catch {
    return '';
  }
}

// scriptutil::getBook: the leading non-digit run, or the previous block's book.
export function getBook(ref, lastBook) {
  const t = ref.trim();
  if (!/[a-z]/i.test(t) && lastBook) return lastBook;
  const m = t.match(/^((?:JST\s*)*[1-4]*\D+)/i);
  const book = m && m[0].trim() !== '' ? m[0].trim() : lastBook;
  return book || ref.replace(/[\d:\-\s–]+$/u, '');
}

const trimChars = (s, chars) => s.replace(new RegExp(`^[${chars}]+|[${chars}]+$`, 'g'), '');

// [{orig, book, verse_ids}] per ";"-separated block. A block after the first keeps the leading
// space left by the split, so PHP prefixed the book to it: "Genesis Genesis 1:1". Reproduced.
export function metaFromRef(ref) {
  const normalized = normalize(ref).replace(/—/g, ' ');
  if (!normalized) return [];
  const blocks = [];
  let book = '';
  for (const piece of normalized.split(';')) {
    let orig = trimChars(piece, ';:');
    if (!orig.trim()) continue;
    book = getBook(orig, book);
    const bare = orig.trim();
    if (orig.startsWith(' ')) orig = book + orig;
    const ids = lookupIds(/[a-z]/i.test(bare) ? bare : `${book} ${bare}`);
    blocks.push({ orig, book, verse_ids: ids });
  }
  return blocks;
}

// The text a block is looked up by: its reference without PHP's doubled book.
export function blockReference(block) {
  const doubled = block.book + ' ' + block.book + ' ';
  return block.orig.startsWith(doubled) ? block.orig.slice(block.book.length + 1) : block.orig;
}

const RANGES = [
  [1, 31103, 'LDS'], [31103, 37707, 'LDS'], [37707, 41361, 'LDS'],
  [41996, 42600, 'LEC'], [42600, 73912, 'JST'], [73912, 82863, 'TSP'], [82863, 83195, 'LAW'],
  [83195, 89431, 'YALI'], [91463, 91885, 'GFRONSDAL'], [91886, 92585, 'ASITIS'],
  [89431, 90773, '1833'], [90773, 99999, '1835'], [92587, 92667, 'MITCHELL'], [92668, 93382, 'ULOLD'],
];

// Versions to try, in order: the requested ones (LDS moved last, as setConfigs did), then the
// default for the verse range. PGP (41361–41995) forces LDS into the requested list.
export function defaultVersions(versions, verseIds) {
  const out = { ...(versions || {}) };
  if ('LDS' in out) {
    const lds = out.LDS;
    delete out.LDS;
    out.LDS = lds;
  }
  if (!verseIds?.length) return out;
  const min = Math.min(...verseIds);
  const max = Math.max(...verseIds);
  if (min >= 41361 && max < 41996 && !('LDS' in out)) out.LDS = 'LDS';
  for (const [lo, hi, v] of RANGES) {
    if (min >= lo && max < hi && !(v in out)) out[v] = v;
  }
  return out;
}
