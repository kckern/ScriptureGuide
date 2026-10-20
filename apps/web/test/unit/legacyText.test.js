import { describe, it, expect } from 'vitest';
import {
  flattenText, stemText, transposeRef, baseVersion, highlightSearchTerm, escapeHtml,
} from '../../src/domain/rules/legacyText.js';

// Fixtures are KJV (public domain) or hand-written.
describe('flattenText (scriptutil::flattenText)', () => {
  it('drops paragraph/section markers and smallcaps brackets', () => {
    expect(flattenText('§¶｟And｠ it came to pass after these things')).toBe('And it came to pass after these things');
  });
  it('turns linebreak markers and repeated spaces into one space', () => {
    expect(flattenText('/Blessed are the meek:/_for they shall inherit the earth.')).toBe(' Blessed are the meek: for they shall inherit the earth.');
    expect(flattenText('in  him')).toBe('in him');
  });
  it('strips tags and keeps curly quotes', () => {
    expect(flattenText('<span class="smallcaps">Lord</span> said, “Behold”')).toBe('Lord said, “Behold”');
  });
  it('removes ~~struck~~ text and adds a space after punctuation between letters', () => {
    expect(flattenText('a ~~b~~ c')).toBe('a c');
    expect(flattenText('one,two')).toBe('one, two');
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
