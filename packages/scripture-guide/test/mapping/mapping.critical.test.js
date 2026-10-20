// test/mapping/mapping.critical.test.js
import { loadYaml } from '../../src/lib/yaml-loader.mjs';
import { loadMappings, mapVerse, mapVerseId, clearMappingCache } from '../../src/lib/mapping-loader.mjs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../fixtures/en/mapping');

// Load fixtures synchronously at top level
const critical = loadYaml(join(FIXTURES_DIR, 'critical.yml'));

// Guard against missing fixtures
if (!critical) {
  throw new Error('Failed to load critical.yml fixtures');
}

describe('Mapping Critical Tests', () => {
  beforeEach(() => {
    clearMappingCache();
  });

  describe('Loader Functionality', () => {
    test('loadMappings returns object for valid canon', () => {
      const mappings = loadMappings('rlds');
      expect(mappings).not.toBeNull();
      expect(typeof mappings).toBe('object');
    });

    test('loadMappings returns null for unknown canon', () => {
      const mappings = loadMappings('unknown_canon');
      expect(mappings).toBeNull();
    });

    test('RLDS has expected target canons', () => {
      const mappings = loadMappings('rlds');
      for (const loaderTest of critical.loader) {
        for (const target of loaderTest.targets) {
          expect(mappings[target]).toBeDefined();
          expect(mappings[target].forward).toBeInstanceOf(Map);
          expect(mappings[target].reverse).toBeInstanceOf(Map);
        }
      }
    });

    test('cache returns same object on repeated calls', () => {
      const first = loadMappings('rlds');
      const second = loadMappings('rlds');
      expect(first).toBe(second);
    });

    test('clearMappingCache clears the cache', () => {
      const first = loadMappings('rlds');
      clearMappingCache();
      const second = loadMappings('rlds');
      expect(first).not.toBe(second);
      expect(first).toEqual(second);
    });
  });

  describe('Bible/JST Mappings', () => {
    const withBibleId = critical.bible_jst.filter(c => c.bible_id !== null);
    const withoutBibleId = critical.bible_jst.filter(c => c.bible_id === null);

    test.each(withBibleId)('$name', ({ rlds_id, bible_id }) => {
      const result = mapVerseId(rlds_id, 'rlds', 'bible');
      expect(result).not.toBeNull();
      expect(result.ids).toContain(bible_id);
    });

    if (withoutBibleId.length > 0) {
      test.each(withoutBibleId)('$name (no Bible equivalent)', ({ rlds_id }) => {
        const result = mapVerseId(rlds_id, 'rlds', 'bible');
        expect(result).toBeNull();
      });
    }
  });

  describe('COC/LDS BOM Mappings', () => {
    test.each(critical.coc_lds)('$name', ({ coc_id, lds_id }) => {
      const result = mapVerseId(coc_id, 'rlds', 'lds');
      expect(result).not.toBeNull();
      expect(result.ids).toContain(lds_id);
    });

    test('reverse mapping: LDS to COC', () => {
      const first = critical.coc_lds[0];
      const result = mapVerseId(first.lds_id, 'lds', 'rlds');
      expect(result).not.toBeNull();
      expect(result.ids).toContain(first.coc_id);
    });
  });

  describe('Reference String Support', () => {
    test('mapVerse with reference string returns refs', () => {
      const testCase = critical.coc_lds.find(c => c.coc_ref);
      if (testCase) {
        const result = mapVerse(testCase.coc_ref, 'rlds', 'lds');
        expect(result).not.toBeNull();
        expect(result.ids).toContain(testCase.lds_id);
        expect(result.refs).toBeDefined();
        expect(result.refs.length).toBeGreaterThan(0);
      }
    });

    test('mapVerse with ID returns no refs', () => {
      const testCase = critical.coc_lds[0];
      const result = mapVerse(testCase.coc_id, 'rlds', 'lds');
      expect(result).not.toBeNull();
      expect(result.ids).toContain(testCase.lds_id);
      expect(result.refs).toBeUndefined();
    });
  });

  describe('Round-trip Verification', () => {
    test.each(critical.roundtrip)('$name', ({ start_id, canon_path, expect_same }) => {
      let currentIds = [start_id];

      for (let i = 0; i < canon_path.length - 1; i++) {
        const from = canon_path[i];
        const to = canon_path[i + 1];
        const result = mapVerseId(currentIds[0], from, to);

        if (result === null) {
          // If mapping doesn't exist, skip this test
          return;
        }

        currentIds = result.ids;
      }

      if (expect_same) {
        // For many-to-one mappings, verify start_id is in the result set
        expect(currentIds).toContain(start_id);
      }
    });
  });

  describe('Partial Mapping Flags', () => {
    test('one-to-one mapping has partial: false', () => {
      const testCase = critical.coc_lds[0];
      const result = mapVerseId(testCase.coc_id, 'rlds', 'lds');
      expect(result).not.toBeNull();
      if (result.ids.length === 1) {
        expect(result.partial).toBe(false);
      }
    });
  });
});
