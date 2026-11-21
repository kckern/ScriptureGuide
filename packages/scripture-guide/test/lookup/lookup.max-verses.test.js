import { lookupReference } from '../../dist/scriptures.mjs';

// Each range is cut at 1000 verses unless the caller asks for a different cap with maxVerses.
// Genesis has 1533 verses, Exodus 1213; Psalms 1-150 has 2461.
describe('maxVerses', () => {
  test.each([
    ['Genesis 1-Exodus 40', 1000, 2746],
    ['Psalms 1-150', 1000, 2461],
    ['Genesis 1-50; Exodus 1-40', 2000, 2746],
  ])('%s: %i by default, all %i with a higher cap', (query, cut, all) => {
    expect(lookupReference(query).verse_ids).toHaveLength(cut);
    expect(lookupReference(query, { maxVerses: 5000 }).verse_ids).toHaveLength(all);
  });

  test('the cap applies per range, and a lower cap cuts sooner', () => {
    expect(lookupReference('Psalms 1-150', { maxVerses: 10 }).verse_ids).toHaveLength(10);
    expect(lookupReference('Genesis 1-Exodus 40', { maxVerses: 2000 }).verse_ids).toHaveLength(2000);
  });

  test('an invalid cap is ignored', () => {
    for (const maxVerses of [0, -5, 'x', null, Infinity]) {
      expect(lookupReference('Psalms 1-150', { maxVerses }).verse_ids).toHaveLength(1000);
    }
  });

  test('the language-fallback lookup takes it too', () => {
    expect(lookupReference('Psalms 1-150', { language: 'ko', maxVerses: 5000 }).verse_ids).toHaveLength(2461);
  });
});
