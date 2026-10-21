// Reference blocks ("meta") as the PHP site built them in scriptures::loadMetaFromRef, and the
// version fallback order from scriptures::defaultVersions.
import { lookupReference } from 'scripture-guide';
import { defaultVersions as defaultVersionList, versionOrder } from '../../domain/rules/defaultVersions.js';
import { getBook } from '../../domain/rules/legacyReference.js';

export { getBook };

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

const trimChars = (s, chars) => s.replace(new RegExp(`^[${chars}]+|[${chars}]+$`, 'g'), '');

// The package splits verses after a comma into their own part ("Matthew 13:24-30, 36-43" →
// "Matthew 13:24-30; 13:36-43"); cleanReference kept them in one block. Group the package's parts
// by the ";"-separated pieces of the input, and join a group's parts back with ", ".
function blockTexts(ref, normalized) {
  const parts = normalized.split(';');
  const pieces = String(ref).split(/;|\.\./);
  const groups = [];
  let used = 0;
  pieces.forEach((piece, i) => {
    const upTo = i === pieces.length - 1 ? parts.length : normalize(pieces.slice(0, i + 1).join(';')).split(';').length;
    if (upTo > used) groups.push(parts.slice(used, upTo));
    used = Math.max(used, upTo);
  });
  return groups.flatMap(group => {
    const out = [group[0]];
    for (const part of group.slice(1)) {
      const prev = out[out.length - 1];
      const bare = part.trim();
      if (!/^\d/.test(bare) || !prev.includes(':')) { out.push(part); continue; }
      const chapter = prev.match(/(\d+):[^:]*$/)?.[1];
      out[out.length - 1] = `${prev}, ${bare.startsWith(`${chapter}:`) ? bare.slice(chapter.length + 1) : bare}`;
    }
    return out;
  });
}

// A book named alone is its first chapter (scriptutil::getRanges): the reference to resolve for
// "Song.of.Solomon" is "Song of Solomon 1"; null when the text has digits or is empty.
export function bookOnlyQuery(ref) {
  const text = String(ref ?? '').replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text && !/\d/.test(text) ? `${text} 1` : null;
}

// The block for a book named alone: its title (lds_scriptures_books) and first chapter.
export function bookOnlyBlock(bookTitle, verseIds) {
  return { orig: bookTitle, book: bookTitle, verse_ids: [...verseIds] };
}

// [{orig, book, verse_ids}] per ";"-separated block. A block after the first keeps the leading
// space left by the split, so PHP prefixed the book to it: "Genesis Genesis 1:1". Reproduced.
export function metaFromRef(ref) {
  const normalized = normalize(ref).replace(/—/g, ' ');
  if (!normalized) return [];
  const blocks = [];
  let book = '';
  for (const piece of blockTexts(ref, normalized)) {
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
