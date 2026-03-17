export class Verse {
  constructor({ id, verseNum, text, version, format = 'prose', hasFootnotes = false, paraBreak = false }) {
    this.id = id;
    this.verseNum = verseNum;
    this.text = text;
    this.version = version;
    this.format = format;
    this.hasFootnotes = hasFootnotes;
    this.paraBreak = paraBreak; // true if a paragraph break precedes this verse
  }

  get wordCount() {
    return this.text.split(/\s+/).filter(w => w.length > 0).length;
  }

  get plainText() {
    // Strip any markup from text
    return this.text
      .replace(/<[^>]*>/g, '')
      .replace(/\[([^\]]+)\]/g, '$1')
      .replace(/\{([^}]+)\}/g, '$1');
  }

  static fromRow(row) {
    return new Verse({
      id: row.verse_id,
      verseNum: row.verse,
      text: row.text,
      version: row.version,
      format: row.format || 'prose',
      hasFootnotes: !!row.has_footnotes,
      paraBreak: !!(row.p && row.p.includes('¶'))
    });
  }
}

export default Verse;
