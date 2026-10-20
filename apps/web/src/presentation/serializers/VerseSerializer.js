export class VerseSerializer {
  static forHtml(verse) {
    return {
      id: verse.id,
      num: verse.verseNum,
      label: verse.verseLabel,
      text: this.formatHtml(verse.text),
      format: verse.format || 'prose',
      version: verse.version
    };
  }

  static forJson(verse) {
    return {
      id: verse.id,
      verse: verse.verseNum,
      text: verse.text
    };
  }

  static forPlain(verse) {
    return `${verse.verseNum}. ${verse.text}`;
  }

  // Render a verse span with vnum — matches PHP's span.verse output
  static renderVerseSpan(verse, showNumbers = true) {
    const label = verse.label != null ? verse.label : verse.num;
    const vnum = (showNumbers && label !== '')
      ? `<sup class="vnum">${label}</sup>`
      : '';
    return `<span class="verse v_${verse.id} ${verse.format || 'prose'}" verse_id="${verse.id}" version="${verse.version || ''}" verse_label="${label}">${vnum}${verse.text}</span>`;
  }

  // Wrap in the right block element based on format
  static renderVerseParagraph(verse, showNumbers = true) {
    const span = this.renderVerseSpan(verse, showNumbers);
    const fmt = verse.format || 'prose';
    if (fmt === 'poetry' || fmt === 'indent') {
      return `\n\t\t\t<blockquote class="${fmt}">${span}</blockquote>`;
    }
    return `\n\t\t\t<p class="${fmt}">${span}</p>`;
  }

  // Split verse text on paragraph/section markers — mirrors PHP preg_split logic
  // Returns [{text, meta}] where meta is the delimiter preceding each segment
  // e.g. "Foo§¶Bar" → [{text:"Foo",meta:""},{text:"Bar",meta:"§¶"}]
  static splitSegments(text) {
    if (!text) return [{ text: '', meta: '' }];
    const DELIM = /([§‾▲]*¶[▲▼◤▼►◄↪]*)/gu;
    const parts = text.split(DELIM);
    const segments = [];
    let metaBuffer = '';
    for (let i = 0; i < parts.length; i++) {
      if (DELIM.test(parts[i])) {
        DELIM.lastIndex = 0;
        metaBuffer = parts[i];
      } else {
        DELIM.lastIndex = 0;
        if (parts[i] !== '') {
          segments.push({ text: parts[i], meta: metaBuffer });
          metaBuffer = '';
        } else {
          metaBuffer = '';
        }
      }
    }
    if (!segments.length) segments.push({ text: text, meta: '' });
    return segments;
  }

  // Split verse text on linebreak markers: /_ (indent linebreak) and / (linebreak)
  // Returns [{text, lbClass}] where lbClass is '' | 'linebreak' | 'indent linebreak'
  // These markers are used in NRSV/ESV/NIV poetry to indicate where line breaks occur
  static splitLinebreaks(text) {
    if (!text || !text.includes('/')) return [{ text, lbClass: '' }];
    const DELIM = /(\/\_|\/)/g;
    const tokens = text.split(DELIM);
    const parts = [];
    let lbClass = '';
    for (const tok of tokens) {
      if (tok === '/_') {
        lbClass = 'indent linebreak';
      } else if (tok === '/') {
        lbClass = 'linebreak';
      } else if (tok !== '') {
        parts.push({ text: tok, lbClass });
        lbClass = '';
      }
    }
    return parts.length ? parts : [{ text, lbClass: '' }];
  }

  static formatHtml(text) {
    if (!text) return '';
    // PHP strips ¶ (structural paragraph marker) from verse text before rendering
    // § is a visible character (e.g. §A Psalm of David.) — do NOT strip
    // _ is consumed by splitLinebreaks before formatHtml is called — do NOT strip here
    return text
      .replace(/¶/gu, '')
      // PHP inline markup patterns:
      // {text} = <small>
      // 〔text〕 = <em>
      // 「text」 = <strong>
      // ⦅text⦆ = sansserif span
      // ｟text｠ = smallcaps span
      // ~~text~~ = <s>
      // 《text》 = <sup>
      .replace(/\{([^}]+)\}/g, '<small>$1</small>')
      .replace(/〔([^〕]+)〕/g, '<em>$1</em>')
      .replace(/「([^」]+)」/g, '<strong>$1</strong>')
      .replace(/⦅([^⦆]+)⦆/g, '<span class="sansserif">$1</span>')
      .replace(/｟([^｠]+)｠/g, '<span class="smallcaps">$1</span>')
      .replace(/~~([^~]+)~~/g, '<s>$1</s>')
      .replace(/《([^》]+)》/g, '<sup>$1</sup>');
  }
}

export default VerseSerializer;
