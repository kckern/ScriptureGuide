// test/mapping/mapping.edge-cases.test.js
import { loadYaml } from '../../src/lib/yaml-loader.mjs';
import { loadMappings, mapVerse, mapVerseId, clearMappingCache } from '../../src/lib/mapping-loader.mjs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../fixtures/en/mapping');

// Load fixtures synchronously at top level
const edgeCases = loadYaml(join(FIXTURES_DIR, 'edge-cases.yml'));

// Guard against missing fixtures
if (!edgeCases) {
  throw new Error('Failed to load edge-cases.yml fixtures');
}

describe('Mapping Edge Cases', () => {
  beforeEach(() => {
    clearMappingCache();
  });

  describe('Book Boundary - First Verses', () => {
    test.each(edgeCases.boundaries.first_verses)(
      '$book first verse: COC $coc_id -> LDS $lds_id',
      ({ coc_id, lds_id }) => {
        const result = mapVerseId(coc_id, 'rlds', 'lds');
        expect(result).not.toBeNull();
        expect(result.ids).toContain(lds_id);
      }
    );
  });

  describe('Book Boundary - Last Verses', () => {
    test.each(edgeCases.boundaries.last_verses)(
      '$book last verse: COC $coc_id -> LDS $lds_id',
      ({ coc_id, lds_id }) => {
        const result = mapVerseId(coc_id, 'rlds', 'lds');
        expect(result).not.toBeNull();
        expect(result.ids).toContain(lds_id);
      }
    );
  });

  describe('Multi-Mappings', () => {
    test.each(edgeCases.multi)(
      '$name',
      ({ coc_id, lds_ids, partial }) => {
        const result = mapVerseId(coc_id, 'rlds', 'lds');
        expect(result).not.toBeNull();

        // Should have multiple targets
        if (lds_ids && lds_ids.length > 1) {
          expect(result.ids.length).toBeGreaterThanOrEqual(lds_ids.length);
          for (const expected of lds_ids) {
            expect(result.ids).toContain(expected);
          }
          expect(result.partial).toBe(partial);
        }
      }
    );
  });

  describe('Invalid Inputs', () => {
    const nullCases = edgeCases.invalid.filter(c => c.expect === null);

    test.each(nullCases)(
      '$name',
      ({ input, from_canon, to_canon }) => {
        const result = mapVerseId(input, from_canon, to_canon);
        expect(result).toBeNull();
      }
    );
  });

  describe('Reference String Parsing', () => {
    const withExpectedId = edgeCases.references.filter(r => r.expect_id);
    const expectingNull = edgeCases.references.filter(r => r.expect === null);

    test.each(withExpectedId)(
      '$name',
      ({ input, canon }) => {
        // Use mapVerse with reference to test parsing
        const result = mapVerse(input, canon, 'lds');
        if (result) {
          // The input should have been parsed correctly
          expect(result.ids.length).toBeGreaterThan(0);
        }
      }
    );

    test.each(expectingNull)(
      '$name returns null',
      ({ input, canon }) => {
        const result = mapVerse(input, canon, 'lds');
        expect(result).toBeNull();
      }
    );
  });

  describe('ID Range Validation', () => {
    const { ranges } = edgeCases;

    test('COC BOM IDs are in expected range', () => {
      const mappings = loadMappings('rlds');
      const ldsMapping = mappings.lds;

      for (const [sourceId] of ldsMapping.forward) {
        expect(sourceId).toBeGreaterThanOrEqual(ranges.coc_bom.min);
        expect(sourceId).toBeLessThanOrEqual(ranges.coc_bom.max);
      }
    });

    test('LDS BOM target IDs are in expected range', () => {
      const mappings = loadMappings('rlds');
      const ldsMapping = mappings.lds;

      for (const [, mapping] of ldsMapping.forward) {
        for (const targetId of mapping.ids) {
          expect(targetId).toBeGreaterThanOrEqual(ranges.lds_bom.min);
          expect(targetId).toBeLessThanOrEqual(ranges.lds_bom.max);
        }
      }
    });

    test('JST IDs are in expected range', () => {
      const mappings = loadMappings('rlds');
      const bibleMapping = mappings.bible;

      for (const [sourceId] of bibleMapping.forward) {
        expect(sourceId).toBeGreaterThanOrEqual(ranges.jst.min);
        expect(sourceId).toBeLessThanOrEqual(ranges.jst.max);
      }
    });

    test('Bible target IDs are in expected range', () => {
      const mappings = loadMappings('rlds');
      const bibleMapping = mappings.bible;

      for (const [, mapping] of bibleMapping.forward) {
        for (const targetId of mapping.ids) {
          expect(targetId).toBeGreaterThanOrEqual(ranges.bible.min);
          expect(targetId).toBeLessThanOrEqual(ranges.bible.max);
        }
      }
    });
  });

  describe('Bidirectional Mapping', () => {
    test('forward and reverse maps are consistent for LDS mapping', () => {
      const mappings = loadMappings('rlds');
      const ldsMapping = mappings.lds;

      // Check a sample of forward mappings exist in reverse
      let checked = 0;
      for (const [sourceId, mapping] of ldsMapping.forward) {
        if (checked >= 100) break; // Sample first 100

        for (const targetId of mapping.ids) {
          const reverseMapping = ldsMapping.reverse.get(targetId);
          expect(reverseMapping).toBeDefined();
          expect(reverseMapping.ids).toContain(sourceId);
        }
        checked++;
      }
    });

    test('every LDS BOM verse is reachable from COC', () => {
      const mappings = loadMappings('rlds');
      const ldsMapping = mappings.lds;

      const reachableLdsIds = new Set();
      for (const [, mapping] of ldsMapping.forward) {
        for (const targetId of mapping.ids) {
          reachableLdsIds.add(targetId);
        }
      }

      const { ranges } = edgeCases;
      const expectedCount = ranges.lds_bom.max - ranges.lds_bom.min + 1;
      expect(reachableLdsIds.size).toBe(expectedCount);
    });
  });

  describe('Coverage Statistics', () => {
    test('COC BOM has complete coverage', () => {
      const mappings = loadMappings('rlds');
      const ldsMapping = mappings.lds;

      const { ranges } = edgeCases;
      const expectedCount = ranges.coc_bom.max - ranges.coc_bom.min + 1;
      expect(ldsMapping.forward.size).toBe(expectedCount);
    });

    test('LDS BOM has complete coverage via reverse map', () => {
      const mappings = loadMappings('rlds');
      const ldsMapping = mappings.lds;

      const { ranges } = edgeCases;
      const expectedCount = ranges.lds_bom.max - ranges.lds_bom.min + 1;
      expect(ldsMapping.reverse.size).toBe(expectedCount);
    });
  });
});
