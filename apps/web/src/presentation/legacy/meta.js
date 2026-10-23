// Reference blocks ("meta") as the PHP site built them in scriptures::loadMetaFromRef, and the
// version fallback order from scriptures::defaultVersions.
import { lookupReference } from 'scripture-guide';
import { defaultVersions as defaultVersionList, versionOrder } from '../../domain/rules/defaultVersions.js';
import { getBook } from '../../domain/rules/legacyReference.js';
import { isEmptyReference } from '../../domain/rules/requestParsing.js';
import { bookOnlyQuery } from '../../domain/rules/referenceParsing.js';

export { getBook, bookOnlyQuery };

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
// Above this many pieces the grouping (one package parse per piece) is skipped: one block per part.
const MAX_GROUPED_PIECES = 50;

function blockTexts(ref, normalized) {
  const parts = normalized.split(';');
  // cleanReference turned ".." into ";", so both separate blocks
  const pieces = String(ref).split(/;|\.\./);
  if (pieces.length > MAX_GROUPED_PIECES) return parts;
  const groups = [];
  let used = 0;
  pieces.forEach((piece, i) => {
    let upTo = parts.length;
    if (i < pieces.length - 1) {
      const prefix = normalize(pieces.slice(0, i + 1).join(';'));
      // A prefix the package cannot read adds no parts; its text joins the next piece's group
      upTo = prefix ? prefix.split(';').length : used;
    }
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

// The block for a book named alone: its title (lds_scriptures_books) and first chapter.
export function bookOnlyBlock(bookTitle, verseIds) {
  return { orig: bookTitle, book: bookTitle, verse_ids: [...verseIds] };
}

// [{orig, book, verse_ids}] per ";"-separated block. A block after the first keeps the leading
// space left by the split, so PHP prefixed the book to it: "Genesis Genesis 1:1". Reproduced.
// An empty reference ("" or "0", PHP empty()) is one block whose verse_ids is false
// (cleanReference returned false).
export function metaFromRef(ref) {
  if (isEmptyReference(ref)) return [{ orig: '', book: '', verse_ids: false }];
  const normalized = normalize(ref).replace(/—/g, ' ');
  if (!normalized) return [];
  const blocks = [];
  let book = '';
  for (const piece of blockTexts(ref, normalized)) {
    let orig = trimChars(piece, ';:');
    if (!orig.trim()) continue;
    // A range across a book end: cleanReference wrote it without spaces ("Malachi 4:5-Matthew
    // 1:2"), and loadMetaFromRef made it one "Multi" block before getBook, keeping the book
    const joined = orig.trim().replace(/\s+-\s+/g, '-');
    if (/[—-](\d\s)*[A-Za-z]/.test(joined)) {
      blocks.push({ orig: joined, book: 'Multi', verse_ids: lookupIds(orig.trim()) });
      continue;
    }
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
