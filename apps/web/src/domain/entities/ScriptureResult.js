export class ScriptureResult {
  constructor({ reference, verses, headings = [], chapterHeading = null, chapterNav = null, annotations = [], config = {}, sections = null }) {
    this.reference = reference;
    this.verses = verses;
    this.headings = headings;
    this.chapterHeading = chapterHeading;
    this.chapterNav = chapterNav;
    this.annotations = annotations;
    this.config = config;
    // For several references separated by ";": one ScriptureResult per reference, in order.
    // The top-level fields then hold the combined reference, verses and headings.
    this.sections = sections;
    // A word alone that names a whole book: { book, verseIds } of its first chapter (meta only)
    this.bookOnly = undefined;
  }

  get isEmpty() {
    return this.verses.length === 0;
  }

  get verseCount() {
    return this.verses.length;
  }

  get wordCount() {
    return this.verses.reduce((sum, v) => sum + v.wordCount, 0);
  }

  get version() {
    return this.config.version || (this.verses[0]?.version) || 'KJV';
  }

  get volume() {
    return this.reference.volume;
  }

  getHeadingForVerse(verseId) {
    return this.headings.find(h => h.verse_id === verseId) || null;
  }

  getAnnotationsForVerse(verseId) {
    return this.annotations.filter(a => a.verse_id === verseId);
  }
}

export default ScriptureResult;
