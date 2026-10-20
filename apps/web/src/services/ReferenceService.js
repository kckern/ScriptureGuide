import { lookupReference, generateReference } from 'scripture-guide';
import { Reference } from '../domain/entities/Reference.js';
import verseRepository from '../data/repositories/VerseRepository.js';
import { parseVerseIdList, splitBookReference, bookKey, formatReference } from '../domain/rules/referenceParsing.js';

export class ReferenceService {
  constructor(verseRepo = verseRepository) {
    this.verseRepository = verseRepo;
  }

  parse(referenceString) {
    if (!referenceString || typeof referenceString !== 'string') {
      return new Reference({ query: '', normalized: '', verseIds: [] });
    }

    try {
      const result = lookupReference(referenceString);
      return Reference.fromLookup(result);
    } catch (error) {
      console.error('Reference parsing error:', error.message);
      return new Reference({
        query: referenceString,
        normalized: '',
        verseIds: []
      });
    }
  }

  // parse(), falling back to the verse index for verse ids, JST books and collections
  // the package does not know (Lectures on Faith, The Sealed Portion, ...).
  async resolve(referenceString) {
    const parsed = this.parse(referenceString);
    if (!parsed.isEmpty || !referenceString) return parsed;
    try {
      return (await this.resolveFromIndex(referenceString)) || parsed;
    } catch (error) {
      console.error('Reference index lookup error:', error.message);
      return parsed;
    }
  }

  async resolveFromIndex(referenceString) {
    const ids = parseVerseIdList(referenceString);
    if (ids) {
      const rows = await this.verseRepository.findIndexRows(ids);
      if (!rows.length) return null;
      const byBook = [];
      for (const row of rows) {
        const last = byBook[byBook.length - 1];
        if (last && last.title === row.book_title) last.rows.push(row);
        else byBook.push({ title: row.book_title, rows: [row] });
      }
      return new Reference({
        query: referenceString,
        normalized: byBook.map(b => formatReference(b.title, b.rows, false)).join('; '),
        verseIds: rows.map(r => r.verse_id),
      });
    }

    const parts = splitBookReference(referenceString);
    if (!parts) return null;
    const book = await this.findBook(parts.book, parts.chapter);
    if (!book) return null;
    const rows = await this.verseRepository.findIndexRowsByBook(book.book_id, parts.chapter, parts.chapterEnd, parts.verseStart, parts.verseEnd);
    if (!rows.length) return null;
    return new Reference({
      query: referenceString,
      normalized: formatReference(book.book_title, rows, parts.verseStart == null),
      verseIds: rows.map(r => r.verse_id),
      _book: book.book_title,
      _bookShort: book.book_title_short,
    });
  }

  async findBook(name, chapter = 1) {
    const books = await this.verseRepository.findAllBooks();
    let key = bookKey(name);
    // "jst john": resolve the base book through the package, then its JST counterpart
    const jst = key.match(/^jst (.+)$/);
    if (jst) {
      const base = this.parse(`${jst[1]} ${chapter}`).book;
      if (base) key = bookKey(`JST ${base}`);
    }
    const fields = b => [b.book_title, b.book_title_short, b.lds_org].map(bookKey);
    return books.find(b => fields(b).includes(key))
      || (key.length >= 3 ? books.find(b => bookKey(b.book_title).startsWith(key)) : null)
      || null;
  }

  format(verseIds) {
    if (!verseIds || verseIds.length === 0) {
      return '';
    }

    try {
      return generateReference(verseIds);
    } catch (error) {
      console.error('Reference generation error:', error.message);
      return '';
    }
  }

  isValidReference(referenceString) {
    const ref = this.parse(referenceString);
    return !ref.isEmpty;
  }
}

export default new ReferenceService();
