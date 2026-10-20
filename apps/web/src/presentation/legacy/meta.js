// Reference blocks ("meta") as the PHP site built them in scriptures::loadMetaFromRef, and the
// version fallback order from scriptures::defaultVersions.
import { lookupReference } from 'scripture-guide';
import { defaultVersions as defaultVersionList, versionOrder } from '../../domain/rules/defaultVersions.js';

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

// domain/rules/defaultVersions.js in the { VERSION: FORMAT } form the legacy formats use:
// the requested versions (LDS moved last, as setConfigs did), then the default for the range.
export function defaultVersions(versions, verseIds) {
  const list = Object.entries(versions || {}).map(([version, format]) => ({ version, format }));
  const out = {};
  for (const v of defaultVersionList(versionOrder(list), verseIds || [])) out[v.version] = v.format;
  return out;
}
