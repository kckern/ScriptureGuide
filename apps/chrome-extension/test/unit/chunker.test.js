import { chunkText, shiftMatches } from '../../src/content/chunker.js';

describe('chunkText', () => {
  test('short text is one chunk at offset 0', () => {
    expect(chunkText('John 3:16 is short.', 100)).toEqual([{ offset: 0, text: 'John 3:16 is short.' }]);
  });
  test('long text splits after sentence ends, within the limit, losing nothing', () => {
    const sentence = 'Read Alma 32:21 and ponder it well. ';
    const text = sentence.repeat(20);
    const chunks = chunkText(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.text).join('')).toBe(text);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(100);
      expect(text.slice(c.offset, c.offset + c.text.length)).toBe(c.text);
      expect(c.text.trimEnd().endsWith('.')).toBe(true);
    }
  });
  test('without sentence ends it splits at a space', () => {
    const text = 'word '.repeat(50);
    const chunks = chunkText(text, 40);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(40);
    expect(chunks.map((c) => c.text).join('')).toBe(text);
    expect(chunks[0].text.endsWith(' ')).toBe(true);
  });
  test('without spaces it splits at the limit', () => {
    const chunks = chunkText('x'.repeat(95), 40);
    expect(chunks.map((c) => c.text.length)).toEqual([40, 40, 15]);
    expect(chunks.map((c) => c.offset)).toEqual([0, 40, 80]);
  });
});

describe('shiftMatches', () => {
  test('moves each chunk\'s matches to node offsets', () => {
    const chunks = [{ offset: 0, text: 'a' }, { offset: 50, text: 'b' }];
    const results = [[{ start: 1, end: 4, ref: 'A' }], [{ start: 2, end: 9, ref: 'B' }]];
    expect(shiftMatches(chunks, results)).toEqual([
      { start: 1, end: 4, ref: 'A' }, { start: 52, end: 59, ref: 'B' }
    ]);
  });
  test('a chunk without results contributes nothing', () => {
    expect(shiftMatches([{ offset: 0, text: 'a' }], [null])).toEqual([]);
  });
});
