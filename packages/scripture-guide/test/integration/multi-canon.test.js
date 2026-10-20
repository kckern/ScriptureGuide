// test/integration/multi-canon.test.js
import {
  loadCanonWithInheritance,
  loadFullLanguage,
  clearCanonCache
} from '../../src/lib/canon-loader.mjs';
import { resolveOptions, setDefaults } from '../../src/lib/options-resolver.mjs';

describe('Multi-Canon Integration', () => {
  beforeEach(() => {
    clearCanonCache();
    setDefaults({ language: 'en', canon: 'lds', fuzzyCanon: true });
  });

  describe('Canon Inheritance', () => {
    test('LDS includes all Bible books', () => {
      const lds = loadCanonWithInheritance('lds');
      const bible = loadCanonWithInheritance('bible');

      // LDS should have more books than Bible alone
      expect(lds.books.length).toBeGreaterThan(bible.books.length);

      // All Bible books should be in LDS
      for (const book of bible.books) {
        const found = lds.books.find(b => b.key === book.key);
        expect(found).toBeDefined();
      }
    });

    test('LDS verse IDs continue after Bible', () => {
      const lds = loadCanonWithInheritance('lds');
      const bible = loadCanonWithInheritance('bible');

      expect(lds.id_start).toBe(bible.id_end + 1);
    });
  });

  describe('Language Merging', () => {
    test('LDS English includes shared patterns', () => {
      const full = loadFullLanguage('lds', 'en');

      // From shared/en.yml
      expect(full.numerals.roman.I).toBe(1);
      expect(full.delimiters.chapter_verse).toContain(':');

      // From canons/bible/en.yml (via inheritance)
      expect(full.books.genesis.name).toBe('Genesis');

      // From canons/lds/en.yml
      expect(full.books['1_nephi'].name).toBe('1 Nephi');
    });
  });

  describe('Options Resolution', () => {
    test('string cascades correctly', () => {
      expect(resolveOptions('ko').language).toBe('ko');
      expect(resolveOptions('bible').canon).toBe('bible');
      expect(resolveOptions('shakespeare').canon).toBe('shakespeare');
    });
  });
});
