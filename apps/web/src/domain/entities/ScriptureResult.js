export class ScriptureResult {
  constructor({ reference, verses, headings = [], chapterHeading = null, chapterNav = null, annotations = [], config = {} }) {
    this.reference = reference;
    this.verses = verses;
    this.headings = headings;
    this.chapterHeading = chapterHeading;
    this.chapterNav = chapterNav;
    this.annotations = annotations;
    this.config = config;
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
