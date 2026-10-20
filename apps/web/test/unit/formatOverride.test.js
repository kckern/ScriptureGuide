import { describe, test, expect } from 'vitest';
import { flattenText, applyFormatOverride } from '../../src/domain/rules/formatOverride.js';

describe('flattenText', () => {
  test('strips markup characters, tags and footnote markers', () => {
    expect(flattenText('§¶｟In｠ the beginning')).toBe('In the beginning');
    expect(flattenText('word｢12｣ next<br/>line')).toBe('word next\nline');
    expect(flattenText('a/b|c  d')).toBe('a b c d');
    expect(flattenText('_indent')).toBe('indent');
    expect(flattenText('end.Next,word')).toBe('end. Next, word');
    expect(flattenText('keep ~~struck~~ out')).toBe('keep out');
  });
});

describe('applyFormatOverride', () => {
  const text = [
    { verse_id: 1, text: '§¶In the beginning God created the heaven and the earth.', format: 'prose', s: '§', p: '¶' },
    { verse_id: 2, text: 'And the earth was without form, and void.', format: 'prose', s: '', p: '' },
  ];
  test('takes paragraphing and format from the format version', () => {
    const fmt = [
      { verse_id: 1, format: 'prose', p: '', s: '§' },
      { verse_id: 2, format: 'prose', p: '¶', s: '' },
    ];
    const out = applyFormatOverride(text, fmt, 'KJV');
    expect(out.map(r => r.text)).toEqual([
      '§¶In the beginning God created the heaven and the earth.',
      '¶And the earth was without form, and void.',
    ]);
    expect(out.map(r => r.mixmatch)).toEqual(['KJV', 'KJV']);
    expect(out[1].p).toBe('¶');
  });
  test('poetry breaks lines at punctuation and indents continuations', () => {
    const out = applyFormatOverride([text[1]], [{ verse_id: 2, format: 'poetry', p: '', s: '' }], 'X');
    expect(out[0].format).toBe('poetry');
    expect(out[0].text).toBe('¶And the earth was without form,/_ and void.');
  });
  test('counts must match, otherwise the text is unchanged', () => {
    expect(applyFormatOverride(text, [{ verse_id: 1, format: 'poetry', p: '', s: '' }], 'X')).toBe(text);
  });
  test('FLAT: every verse its own prose paragraph, no mixmatch label', () => {
    const out = applyFormatOverride(text, 'FLAT', 'FLAT');
    expect(out.map(r => r.text)).toEqual([
      '¶In the beginning God created the heaven and the earth.',
      '¶And the earth was without form, and void.',
    ]);
    expect(out[0].mixmatch).toBeUndefined();
  });
});
