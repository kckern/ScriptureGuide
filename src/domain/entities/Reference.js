import { volumeDetection } from '../rules/volumeDetection.js';

export class Reference {
  constructor({ query, normalized, verseIds, _book, _bookShort, _chapter }) {
    this.query = query;
    this.normalized = normalized;
    this.verseIds = verseIds || [];
    // Optional overrides for DB-slug-resolved references (books not in scripture-guide package)
    if (_book) this._book = _book;
    if (_bookShort) this._bookShort = _bookShort;
    if (_chapter) this._chapter = _chapter;
  }

  get isRange() {
    return this.verseIds.length > 1;
  }

  get isSingleVerse() {
    return this.verseIds.length === 1;
  }

  get isEmpty() {
    return this.verseIds.length === 0;
  }

  get firstVerseId() {
    return this.verseIds[0] || null;
  }

  get lastVerseId() {
    return this.verseIds[this.verseIds.length - 1] || null;
  }

  get volume() {
    if (this.isEmpty) return null;
    return volumeDetection(this.firstVerseId);
  }

  // Parse book name from normalized ref: "John 3:16" → "John", "1 Nephi 1" → "1 Nephi"
  get book() {
    if (this._book) return this._book;
    if (!this.normalized) return '';
    const match = this.normalized.match(/^(.*?)\s+(\d+)(?::\d.*)?$/);
    return match ? match[1] : this.normalized;
  }

  // Parse chapter number from normalized ref
  get chapter() {
    if (this._chapter) return this._chapter;
    if (!this.normalized) return null;
    const match = this.normalized.match(/\s+(\d+)(?::\d.*)?$/);
    return match ? parseInt(match[1], 10) : null;
  }

  get verseCount() {
    return this.verseIds.length;
  }

  contains(verseId) {
    return this.verseIds.includes(verseId);
  }

  static fromLookup(lookupResult) {
    return new Reference({
      query: lookupResult.query,
      normalized: lookupResult.ref,
      verseIds: lookupResult.verse_ids
    });
  }
}

export default Reference;
