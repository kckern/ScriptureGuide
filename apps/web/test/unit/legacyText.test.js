import { describe, it, expect } from 'vitest';
import {
  flattenText, splitVerseLines, arrayText, plainText, plainPassage,
  stemText, transposeRef, baseVersion, highlightSearchTerm, escapeHtml, renderHeadingHtml, segmentFormats,
} from '../../src/domain/rules/legacyText.js';

// Fixtures are KJV (public domain) or hand-written.
describe('flattenText (scriptutil::flattenText)', () => {
  it('drops section and paragraph markers and smallcaps brackets', () => {
    expect(flattenText('§¶｟In｠ the beginning God created the heaven and the earth.'))
      .toBe('In the beginning God created the heaven and the earth.');
    expect(flattenText('§¶｟And｠ it came to pass after these things')).toBe('And it came to pass after these things');
  });
  it('drops footnote markers and tags, keeps <br/> as a newline', () => {
    expect(flattenText('the <i>Word</i>｢12｣ was God')).toBe('the Word was God');
    expect(flattenText('<span class="smallcaps">Lord</span> said')).toBe('Lord said');
    expect(flattenText('word｢12｣ next<br/>line')).toBe('word next\nline');
  });
  it('turns line and verse separators and repeated spaces into one space', () => {
    expect(flattenText('The Lord is my shepherd;/I shall not want.')).toBe('The Lord is my shepherd; I shall not want.');
    expect(flattenText('a || b')).toBe('a b');
    expect(flattenText('/Blessed are the meek:/_for they shall inherit the earth.')).toBe(' Blessed are the meek: for they shall inherit the earth.');
    expect(flattenText('in  him')).toBe('in him');
    expect(flattenText('｟The｠ word_ of｢12｣ God|said')).toBe('The word of God said');
  });
  it('removes underscores and struck-out text', () => {
    expect(flattenText('_indented ~~gone~~text')).toBe('indented text');
    expect(flattenText('a ~~b~~ c')).toBe('a c');
  });
  it('adds a space after punctuation run together between letters', () => {
    expect(flattenText('first,second.third')).toBe('first, second. third');
    expect(flattenText('end.Next')).toBe('end. Next');
  });
  it('drops digits that follow Korean letters, or any non-ASCII character (PHP byte regex)', () => {
    expect(flattenText('안녕하세요1 세계')).toBe('안녕하세요 세계');
    expect(flattenText('people—200,000 men')).toBe('people—,000 men');
  });
  it('keeps typographic quotes and dashes', () => {
    expect(flattenText('the Lord’s house—“yea”')).toBe('the Lord’s house—“yea”');
    expect(flattenText('<span class="smallcaps">Lord</span> said, “Behold”')).toBe('Lord said, “Behold”');
  });
});

describe('verse lines (scriptures::formattedData)', () => {
  it('splitVerseLines splits on paragraph meta and line breaks, skipping empties', () => {
    expect(splitVerseLines('§¶A Psalm of David.¶▼The Lord is my shepherd,/I shall not want.'))
      .toEqual(['A Psalm of David.', 'The Lord is my shepherd,', 'I shall not want.']);
    expect(splitVerseLines('§¶In the beginning/God created¶▼the heaven')).toEqual(['In the beginning', 'God created', 'the heaven']);
  });
  it('arrayText prefixes each line with a space, as renderArray does', () => {
    expect(arrayText('§¶｟The｠ word that Isaiah saw.')).toBe(' The word that Isaiah saw.');
    expect(arrayText('¶one/two')).toBe(' one two');
  });
  it('plainText joins lines with single spaces and trims', () => {
    expect(plainText('§¶In the beginning/ God created  the heaven.')).toBe('In the beginning God created the heaven.');
  });
});

describe('plainPassage (renderText for one passage)', () => {
  it('joins verse lines with single spaces and keeps a trailing space', () => {
    const verses = [
      { text: '§¶｟In｠ the beginning God created the heaven and the earth.' },
      { text: 'And the earth was without form, and void.' },
    ];
    expect(plainPassage(verses)).toBe('In the beginning God created the heaven and the earth. And the earth was without form, and void. ');
  });
  it('skips gap verses marked with an asterisk', () => {
    expect(plainPassage([{ text: 'a' }, { text: '*' }, { text: 'b' }])).toBe('a b ');
  });
});

describe('stemText (versebox.php callb)', () => {
  it('wraps each word with a stem that drops four letters from long words', () => {
    expect(stemText('For God so loved the world, that he gave his only begotten Son'))
      .toBe("<span stem='for'>For</span> <span stem='god'>God</span> <span stem='so'>so</span> <span stem='loved'>loved</span> <span stem='the'>the</span> <span stem='world'>world</span>, <span stem='that'>that</span> <span stem='he'>he</span> <span stem='gave'>gave</span> <span stem='his'>his</span> <span stem='only'>only</span> <span stem='bego'>begotten</span> <span stem='son'>Son</span>");
  });
});

describe('transposeRef', () => {
  it('prefixes JST when reading in JST and removes it otherwise', () => {
    expect(transposeRef('Mark 5', 'JST')).toBe('JST Mark 5');
    expect(transposeRef('JST Mark 5', 'JST')).toBe('JST Mark 5');
    expect(transposeRef('JST Mark 5', 'KJV')).toBe(' Mark 5');
    expect(transposeRef('John 3:16', 'KJV')).toBe('John 3:16');
  });
});

describe('baseVersion', () => {
  it('drops a format suffix', () => {
    expect(baseVersion('NIV*KJV')).toBe('NIV');
  });
});

describe('highlightSearchTerm', () => {
  it('wraps whole-word matches in text, not in attributes', () => {
    const html = '<span class="verse" ref="love">God so loved the world; love is</span>';
    expect(highlightSearchTerm(html, 'love'))
      .toBe('<span class="verse" ref="love">God so loved the world; <span class=\'searchterm\'>love</span> is</span>');
  });
  it('matches multi-word terms across punctuation and ignores regex characters', () => {
    expect(highlightSearchTerm('<p>so loved, the world</p>', 'loved the')).toBe("<p>so <span class='searchterm'>loved, the</span> world</p>");
    expect(highlightSearchTerm('<p>a (b</p>', '(b')).toBe('<p>a (b</p>');
  });
  it('is a no-op without a term', () => {
    expect(highlightSearchTerm('<p>x</p>', '')).toBe('<p>x</p>');
  });
});

describe('escapeHtml', () => {
  it('escapes markup characters', () => {
    expect(escapeHtml(`<a href="x">'&`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  });
});

describe('renderHeadingHtml (scriptutil::renderHeadingHTML)', () => {
  it('turns "/" into a line break and subscript digits into <sub>', () => {
    expect(renderHeadingHtml('Salt/and Light')).toBe('Salt<br/>and Light');
    expect(renderHeadingHtml('Lehi\u2081\u2019s Words to Joseph\u2082')).toBe('Lehi<sub>1</sub>\u2019s Words to Joseph<sub>2</sub>');
    expect(renderHeadingHtml('A\u2083 B\u2084')).toBe('A<sub>3</sub> B<sub>4</sub>');
    expect(renderHeadingHtml(null)).toBe('');
  });
});

describe('segmentFormats (scriptures::formattedData paragraph markers)', () => {
  const seg = (meta, text = 'And it came to pass.') => ({ meta, text });
  it('starts from the verse format and keeps a marker\'s format for the rest of the verse', () => {
    expect(segmentFormats('prose', [seg(''), seg('¶↪'), seg('¶')])).toEqual([
      { format: 'prose', paraClass: '' }, { format: 'indent', paraClass: '' }, { format: 'indent', paraClass: '' },
    ]);
    expect(segmentFormats('prose', [seg('¶▼'), seg('¶►')]).map(f => f.format)).toEqual(['poetry', 'prose']);
  });
  it('¶◄ starts a flush paragraph; ¶◤ a linebreak one; ‾¶ a nogap one', () => {
    expect(segmentFormats('prose', [seg('¶◄')])).toEqual([{ format: 'prose', paraClass: 'flush' }]);
    expect(segmentFormats('indent', [seg('§¶◄')])).toEqual([{ format: 'indent', paraClass: 'flush' }]);
    expect(segmentFormats('poetry', [seg('¶◤')])).toEqual([{ format: 'prose', paraClass: 'linebreak' }]);
    expect(segmentFormats('poetry', [seg('‾¶')])).toEqual([{ format: 'prose', paraClass: 'nogap' }]);
    expect(segmentFormats('prose', [seg('¶▼◄')])).toEqual([{ format: 'prose', paraClass: 'flush' }]);
  });
  it('a line that starts with § (a subtitle) is prose', () => {
    expect(segmentFormats('poetry', [seg('¶', '§A Psalm of David.'), seg('/')]).map(f => f.format)).toEqual(['prose', 'poetry']);
  });
});
