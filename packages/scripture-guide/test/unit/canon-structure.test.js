import { loadCanonStructure, loadCanonWithInheritance, clearCanonCache } from '../../src/lib/canon-loader.mjs';

describe('Canon Structure Loading', () => {
  beforeEach(() => {
    clearCanonCache();
  });

  test('loads Bible structure', () => {
    const bible = loadCanonStructure('bible');

    expect(bible).not.toBeNull();
    expect(bible.canon).toBe('bible');
    expect(bible.id_start).toBe(1);
    expect(bible.id_end).toBe(31102);
    expect(bible.books).toBeDefined();
    expect(Array.isArray(bible.books)).toBe(true);
    expect(bible.books.length).toBe(66);

    // Check first book
    const genesis = bible.books.find(b => b.key === 'genesis');
    expect(genesis).toBeDefined();
    expect(genesis.order).toBe(1);
    expect(genesis.chapters).toBe(50);
    expect(genesis.first_verse_id).toBe(1);

    // Check last book
    const revelation = bible.books.find(b => b.key === 'revelation');
    expect(revelation).toBeDefined();
    expect(revelation.order).toBe(66);
  });

  test('returns null for unknown canon', () => {
    const unknown = loadCanonStructure('nonexistent');
    expect(unknown).toBeNull();
  });

  test('loads LDS structure with extends', () => {
    const lds = loadCanonStructure('lds');

    expect(lds).not.toBeNull();
    expect(lds.canon).toBe('lds');
    expect(lds.extends).toBe('bible');
    expect(lds.id_start).toBe(31103);
    expect(lds.id_end).toBe(41995);

    // LDS-specific books
    const nephi1 = lds.books.find(b => b.key === '1_nephi');
    expect(nephi1).toBeDefined();
    expect(nephi1.first_verse_id).toBe(31103);
  });

  test('loadCanonWithInheritance merges parent canon', () => {
    const lds = loadCanonWithInheritance('lds');

    // Should have Bible books + LDS books
    expect(lds.books.length).toBeGreaterThan(66);

    // Genesis from Bible
    const genesis = lds.books.find(b => b.key === 'genesis');
    expect(genesis).toBeDefined();
    expect(genesis.first_verse_id).toBe(1);

    // 1 Nephi from LDS
    const nephi1 = lds.books.find(b => b.key === '1_nephi');
    expect(nephi1).toBeDefined();
    expect(nephi1.first_verse_id).toBe(31103);
  });
});
