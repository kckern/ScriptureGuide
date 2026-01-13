import {
  getCanonStructure,
  getLanguageData,
  getCocMapping,
  clearDataCache
} from '../../src/lib/data-loader.mjs';

describe('Data Loader', () => {
  beforeEach(() => {
    clearDataCache();
  });

  describe('getCanonStructure', () => {
    test('returns bible structure', () => {
      const structure = getCanonStructure('bible');
      expect(structure.canon).toBe('bible');
      expect(structure.books.length).toBe(66);
    });

    test('returns lds structure with bible books merged', () => {
      const structure = getCanonStructure('lds');
      expect(structure.canon).toBe('lds');
      expect(structure.books.length).toBe(87);
    });

    test('returns coc structure with bible books merged', () => {
      const structure = getCanonStructure('coc');
      expect(structure.canon).toBe('coc');
      expect(structure.books.length).toBe(81);
    });

    test('bible structure has Genesis as first book', () => {
      const structure = getCanonStructure('bible');
      const genesis = structure.books.find(b => b.key === 'genesis');
      expect(genesis).toBeDefined();
      expect(genesis.order).toBe(1);
      expect(genesis.chapters).toBe(50);
      expect(genesis.first_verse_id).toBe(1);
    });

    test('bible structure has Revelation as last book', () => {
      const structure = getCanonStructure('bible');
      const revelation = structure.books.find(b => b.key === 'revelation');
      expect(revelation).toBeDefined();
      expect(revelation.order).toBe(66);
    });

    test('lds structure includes both bible and lds-specific books', () => {
      const structure = getCanonStructure('lds');

      // Bible books
      const genesis = structure.books.find(b => b.key === 'genesis');
      expect(genesis).toBeDefined();
      expect(genesis.first_verse_id).toBe(1);

      // LDS-specific books
      const nephi1 = structure.books.find(b => b.key === '1_nephi');
      expect(nephi1).toBeDefined();
      expect(nephi1.first_verse_id).toBe(31103);
    });

    test('coc structure includes both bible and coc-specific books', () => {
      const structure = getCanonStructure('coc');

      // Bible books
      const genesis = structure.books.find(b => b.key === 'genesis');
      expect(genesis).toBeDefined();

      // COC-specific books (with different versification)
      const nephi1 = structure.books.find(b => b.key === '1_nephi');
      expect(nephi1).toBeDefined();
      // COC has different chapter/verse structure than LDS
      expect(nephi1.chapters).toBe(7);
    });

    test('returns null for unknown canon', () => {
      const structure = getCanonStructure('nonexistent');
      expect(structure).toBeNull();
    });

    test('caching works correctly', () => {
      const first = getCanonStructure('bible');
      const second = getCanonStructure('bible');
      expect(first).toBe(second); // Same reference due to caching
    });

    test('clearDataCache clears the cache', () => {
      const first = getCanonStructure('bible');
      clearDataCache();
      const second = getCanonStructure('bible');
      // Should be equal but not same reference (new object after cache clear)
      expect(first).toEqual(second);
      expect(first).not.toBe(second);
    });
  });

  describe('getLanguageData', () => {
    test('returns merged english data for bible', () => {
      const data = getLanguageData('bible', 'en');
      expect(data.books.genesis).toBeDefined();
      expect(data.books.genesis.name).toBe('Genesis');
      expect(data.delimiters).toBeDefined();
    });

    test('returns merged english data for lds', () => {
      const data = getLanguageData('lds', 'en');
      expect(data.books.genesis.name).toBe('Genesis');
      expect(data.books['1_nephi'].name).toBe('1 Nephi');
    });

    test('includes shared delimiters', () => {
      const data = getLanguageData('bible', 'en');
      expect(data.delimiters.chapter_verse).toContain(':');
      expect(data.delimiters.range).toContain('-');
    });

    test('includes shared labels', () => {
      const data = getLanguageData('bible', 'en');
      expect(data.labels.chapter).toContain('chapter');
      expect(data.labels.verse).toContain('verse');
    });

    test('includes pre_rules from shared', () => {
      const data = getLanguageData('bible', 'en');
      expect(data.pre_rules).toBeDefined();
      expect(Array.isArray(data.pre_rules)).toBe(true);
    });

    test('lds has additional pre_rules merged', () => {
      const data = getLanguageData('lds', 'en');
      expect(data.pre_rules).toBeDefined();
      // LDS has its own pre_rules that should be included
    });

    test('returns null for unknown canon', () => {
      const data = getLanguageData('nonexistent', 'en');
      expect(data).toBeNull();
    });

    test('returns null for unknown language', () => {
      const data = getLanguageData('bible', 'xyz');
      expect(data).toBeNull();
    });

    test('coc language data includes bible books', () => {
      const data = getLanguageData('coc', 'en');
      expect(data.books.genesis).toBeDefined();
      expect(data.books.genesis.name).toBe('Genesis');
    });
  });

  describe('getCocMapping', () => {
    test('returns mapping data asynchronously', async () => {
      const mapping = await getCocMapping();
      expect(mapping).toBeDefined();
      expect(mapping.cocToLds).toBeDefined();
    });

    test('mapping contains verse mappings', async () => {
      const mapping = await getCocMapping();
      // Check that the mapping has expected structure
      expect(mapping.cocToLds['1']).toBeDefined();
      expect(mapping.cocToLds['1'].lds).toBeDefined();
    });

    test('lazy loading caches the result', async () => {
      const first = await getCocMapping();
      const second = await getCocMapping();
      expect(first).toBe(second); // Same reference
    });
  });
});
