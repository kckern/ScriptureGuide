import { lookupReference, generateReference } from '../../dist/scriptures.mjs';

// The bible structure keyed the book "solomon_s_song" while every language file names it
// "song_of_solomon", so no Song of Solomon reference resolved.
describe('Song of Solomon', () => {
  test('song 2:1 resolves to a verse', () => {
    const result = lookupReference('song 2:1');
    expect(result.ref).toBe('Song of Solomon 2:1');
    expect(result.verse_ids).toEqual([17556]);
  });

  test('the verse id round-trips through generateReference', () => {
    const [id] = lookupReference('song 2:1').verse_ids;
    expect(generateReference([id])).toBe('Song of Solomon 2:1');
  });
});
