// The reference blocks of the PHP site (scriptures::loadMetaFromRef) for references the package
// cannot read: cleanReference, then one block { orig, book, verse_ids } per ";" piece, verses found
// by their verse_title (scriptutil::getRanges / listVerses / loadVerseIds). The meta, api, plain and
// raw formats and the headings of a not-found html passage are built from these blocks.
//
// A piece with a hyphen before a letter is a range across books (book "Multi"): each end is looked
// up on its own and every id between them is listed. PHP compared the ends loosely, so an end that
// matched nothing still counts: [null] when neither matched, null to the last verse when only the
// end matched ("<word>-king1" listed Genesis 1:1 through 1 Kings 1:53, about 8,800 verses), and
// nothing when only the start matched. Ranges longer than maxRange are not expanded: the block
// gets no verses, so a short junk URL cannot ask for thousands of verses.
import legacyReferenceRepository from '../data/repositories/LegacyReferenceRepository.js';
import { cleanReference, numericVerseIds, phpTrim } from '../domain/rules/cleanReference.js';
import { getBook } from '../domain/rules/legacyReference.js';
import { RequestBudget } from '../domain/rules/requestBudget.js';

// The scripture-guide package lists at most 1000 verses for a reference; so does a range here.
export const MAX_MULTI_RANGE = 1000;
// Nesting of multi-book ranges inside the ends of a multi-book range.
const MAX_DEPTH = 3;

const MULTI = /[—-](\d\s)*[A-Za-z]/;
const trimChars = (s, chars) => s.replace(new RegExp(`^[${chars}]+|[${chars}]+$`, 'g'), '');
const isPhpEmpty = v => v == null || v === '' || v === '0' || v === false || (Array.isArray(v) && !v.length);

// scriptutil::getRanges: "3:16-4:2" → ["3: 16-Y", "4: X-2"] ("X"/"Y" the first and last verse of
// the chapter); false for more than 200 chapters.
export function getRanges(input, lastBook) {
  const ref = String(input).replace(/[‐−–—]/g, '-');
  const numbers = phpTrim(lastBook ? ref.split(lastBook).join('') : ref);
  const chaptersOnly = !numbers.includes(':');
  const isRange = numbers.includes('-');
  const isSplit = numbers.includes(',');
  const ranges = [];
  if (chaptersOnly && isSplit) {
    for (const i of numbers.split(',')) ranges.push(`${i}: X-Y`);
  } else if (chaptersOnly && isRange) {
    const [from, to] = numbers.split('-').map(Number);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return ranges;
    for (let i = from; i <= to; i++) {
      ranges.push(`${i}: X-Y`);
      if (ranges.length > 200) return false;
    }
  } else if (chaptersOnly) {
    ranges.push(`${numbers}: X-Y`);
  } else if (isSplit) {
    // "3:1-2, 5" and "3:16, 18": a part without a chapter keeps the last one
    let chapter;
    for (let split of numbers.split(',')) {
      if (split.includes(':')) [chapter, split] = split.split(':');
      ranges.push(`${chapter ?? ''}:${split}`);
    }
  } else if (isRange) {
    const chapters = [...numbers.matchAll(/(\d+):/g)].map(m => m[1]);
    const verses = [...numbers.matchAll(/[:-](\d+[a-z]*)/g)].map(m => m[1]);
    if (isPhpEmpty(chapters[1])) chapters[1] = chapters[0];
    const from = Number(chapters[0]);
    const to = Number(chapters[1]);
    for (let i = from; i <= to; i++) {
      const start = String(i) === chapters[0] ? verses[0] : 'X';
      const end = String(i) === chapters[1] ? verses[verses.length - 1] : 'Y';
      ranges.push(`${i}: ${start}-${end}`);
      if (ranges.length > 200) return false;
    }
  } else {
    ranges.push(numbers);
  }
  return ranges;
}

// PHP array_merge over the blocks' verse_ids, as index.php built $all_verse_ids: a block whose
// verse_ids is not an array (false, null) makes the result null (PHP 7 array_merge).
export function allVerseIds(blocks) {
  let all = [];
  for (const block of blocks) {
    if (all === null || !Array.isArray(block.verse_ids)) { all = null; continue; }
    all = all.concat(block.verse_ids);
  }
  return all;
}

// PHP's loose "$i <= $end" for verse ids that may be null.
function looseLe(a, b) {
  if (a == null) return true; // null <= anything: false <= bool, or "" <= "123"
  if (b == null) return false; // an id is truthy, null is false
  return a <= b;
}

export class LegacyBlockService {
  constructor(repo = legacyReferenceRepository, { maxRange = MAX_MULTI_RANGE } = {}) {
    this.repo = repo;
    this.maxRange = maxRange;
  }

  // cleanReference with its numeric branch: verse ids are turned into their reference first.
  async clean(ref, budget) {
    const ids = numericVerseIds(ref);
    if (!ids) return cleanReference(ref);
    const text = ids.length && budget.takeQuery() ? await this.repo.referenceFromVerseIds(ids) : '';
    return cleanReference(String(text || '').replace(/—/g, ' '));
  }

  // scriptutil::loadChapterMax: the last verse of "<book> <chapter>", by verse title. The maxima
  // of every chapter of a book come from one query, kept for the request.
  async chapterMax(book, chapter, budget) {
    const ref = await this.clean(`${book === false ? '' : book} ${chapter ?? ''}`, budget);
    if (ref === false || ref === '') return null;
    const m = ref.match(/^(.*\S)\s+\d+$/);
    if (!m) {
      return budget.memo(`max:${ref}`, async () => (budget.takeQuery() ? this.repo.chapterMax(ref) : null));
    }
    const maxima = await budget.memo(`book:${m[1]}`, async () => (budget.takeQuery() ? this.repo.chapterMaxima(m[1]) : new Map()));
    return maxima.get(ref) ?? null;
  }

  // scriptutil::listVerses + loadVerseIds: false without a book or titles, else the ids. The
  // verses listed count against the request's verse budget.
  async verseIds(book, ranges, budget) {
    if (isPhpEmpty(book) || !ranges) return false;
    const titles = [];
    for (const range of ranges) {
      const m = range.match(/(\d+): *([\dXY]+)([a-z]*)-*([\dXY]*)([a-z]*)/) || [];
      let [, chapter, start, , end] = m;
      if (isPhpEmpty(chapter)) { chapter = '1'; start = '1'; end = 'Y'; }
      if (start === 'X') start = '1';
      if (end === 'Y') end = await this.chapterMax(book, chapter, budget);
      if (end == null || end === '') end = start;
      for (let i = Number(start); i <= Number(end) && titles.length < budget.verses; i++) titles.push(`${book} ${chapter}:${i}`);
    }
    if (!titles.length) return false;
    if (!budget.takeQuery()) return [];
    const ids = await this.repo.verseIds(titles);
    return budget.takeVerses(ids.length) ? ids : [];
  }

  // The first verse id of a reference: scriptures::lookup($point, meta_only)[0]['verse_ids'][0]
  async firstVerseId(point, budget, depth) {
    const blocks = await this.blocks(point, budget, depth + 1);
    return (Array.isArray(blocks[0]?.verse_ids) ? blocks[0].verse_ids[0] : null) ?? null;
  }

  // budget: the request's RequestBudget; a piece of the reference (not of a range's ends) takes
  // one of its pieces, and pieces past it are blocks without a lookup.
  async blocks(ref, budget = new RequestBudget(), depth = 0) {
    if (depth > MAX_DEPTH) return [];
    const cleaned = await this.clean(ref, budget);
    const out = [];
    let book = '';
    let all; // $all_verse_ids: shared by every range of the reference, never reset
    for (const piece of (cleaned === false ? '' : cleaned).split(';')) {
      let orig = trimChars(piece, ';:');
      const lookUp = depth > 0 || budget.takePiece();
      if (MULTI.test(orig)) {
        if (!lookUp) {
          out.push({ orig: phpTrim(orig), book: 'Multi', verse_ids: [] });
          continue;
        }
        const range = orig.split('-');
        if (range[1] !== ':') {
          const m = (range[1] ?? '').match(/(.*?)\s(\d+)$/);
          const max = m ? await this.chapterMax(await this.clean(m[1], budget), m[2], budget) : null;
          range[1] = `${range[1] ?? ''}:${max ?? ''}`;
        }
        // PHP looked up every point between hyphens but used only the first two
        const ends = [];
        for (const point of range.slice(0, 2)) ends.push(await this.firstVerseId(point, budget, depth));
        const [from, to] = ends.map(id => (id == null ? null : Number(id)));
        const count = from == null ? (to == null ? 1 : to + 1) : (to == null ? 0 : Math.max(0, to - from + 1));
        if (count > this.maxRange || !budget.takeVerses(count)) {
          out.push({ orig: phpTrim(orig), book: 'Multi', verse_ids: [] });
          continue;
        }
        for (let i = from; looseLe(i, to); i = i == null ? 1 : i + 1) (all ??= []).push(i);
        out.push({ orig: phpTrim(orig), book: 'Multi', verse_ids: all ? [...all] : null });
        continue;
      }
      book = getBook(orig, book);
      if (orig.startsWith(' ')) orig = book + orig;
      const ids = lookUp ? await this.verseIds(book, getRanges(orig, book), budget) : (isPhpEmpty(book) ? false : []);
      out.push({ orig, book, verse_ids: ids });
    }
    return out;
  }
}

export default new LegacyBlockService();
