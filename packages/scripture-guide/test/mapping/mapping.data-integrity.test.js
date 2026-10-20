// test/mapping/mapping.data-integrity.test.js
import { loadYaml } from '../../src/lib/yaml-loader.mjs';
import { join } from 'path';

const DATA_DIR = 'data';

describe('Mapping Data Integrity', () => {
  let rldsMapping;

  beforeAll(() => {
    rldsMapping = loadYaml(join(DATA_DIR, 'canons', 'rlds', '_mapping.yml'));
  });

  describe('RLDS Mapping File Structure', () => {
    test('mapping file loads successfully', () => {
      expect(rldsMapping).not.toBeNull();
      expect(typeof rldsMapping).toBe('object');
    });

    test('has bible mapping section', () => {
      expect(rldsMapping.bible).toBeDefined();
      expect(rldsMapping.bible.runs).toBeDefined();
      expect(rldsMapping.bible.singles).toBeDefined();
      expect(rldsMapping.bible.multi).toBeDefined();
    });

    test('has lds mapping section', () => {
      expect(rldsMapping.lds).toBeDefined();
      expect(rldsMapping.lds.runs).toBeDefined();
      expect(rldsMapping.lds.singles).toBeDefined();
      expect(rldsMapping.lds.multi).toBeDefined();
    });
  });

  describe('Bible Mapping (JST ↔ KJV)', () => {
    const JST_RANGE = { min: 1, max: 31333 };
    const BIBLE_RANGE = { min: 1, max: 31102 };

    test('all runs have valid format [start, target, length]', () => {
      for (const run of rldsMapping.bible.runs) {
        expect(Array.isArray(run)).toBe(true);
        expect(run.length).toBe(3);
        expect(typeof run[0]).toBe('number');
        expect(typeof run[1]).toBe('number');
        expect(typeof run[2]).toBe('number');
        expect(run[2]).toBeGreaterThan(0);
      }
    });

    test('all singles have valid format [source, target]', () => {
      for (const single of rldsMapping.bible.singles) {
        expect(Array.isArray(single)).toBe(true);
        expect(single.length).toBe(2);
        expect(typeof single[0]).toBe('number');
        expect(typeof single[1]).toBe('number');
      }
    });

    test('all multi have valid format [source, [targets]]', () => {
      for (const multi of rldsMapping.bible.multi) {
        expect(Array.isArray(multi)).toBe(true);
        expect(multi.length).toBe(2);
        expect(typeof multi[0]).toBe('number');
        expect(Array.isArray(multi[1])).toBe(true);
        expect(multi[1].length).toBeGreaterThan(0);
        for (const target of multi[1]) {
          expect(typeof target).toBe('number');
        }
      }
    });

    test('all source IDs within JST range', () => {
      // Check runs
      for (const [start, , length] of rldsMapping.bible.runs) {
        expect(start).toBeGreaterThanOrEqual(JST_RANGE.min);
        expect(start + length - 1).toBeLessThanOrEqual(JST_RANGE.max);
      }
      // Check singles
      for (const [source] of rldsMapping.bible.singles) {
        expect(source).toBeGreaterThanOrEqual(JST_RANGE.min);
        expect(source).toBeLessThanOrEqual(JST_RANGE.max);
      }
      // Check multi
      for (const [source] of rldsMapping.bible.multi) {
        expect(source).toBeGreaterThanOrEqual(JST_RANGE.min);
        expect(source).toBeLessThanOrEqual(JST_RANGE.max);
      }
    });

    test('all target IDs within Bible range', () => {
      // Check runs
      for (const [, target, length] of rldsMapping.bible.runs) {
        expect(target).toBeGreaterThanOrEqual(BIBLE_RANGE.min);
        expect(target + length - 1).toBeLessThanOrEqual(BIBLE_RANGE.max);
      }
      // Check singles
      for (const [, target] of rldsMapping.bible.singles) {
        expect(target).toBeGreaterThanOrEqual(BIBLE_RANGE.min);
        expect(target).toBeLessThanOrEqual(BIBLE_RANGE.max);
      }
      // Check multi
      for (const [, targets] of rldsMapping.bible.multi) {
        for (const target of targets) {
          expect(target).toBeGreaterThanOrEqual(BIBLE_RANGE.min);
          expect(target).toBeLessThanOrEqual(BIBLE_RANGE.max);
        }
      }
    });

    test('no overlapping source IDs', () => {
      const sourceIds = new Set();

      // Collect all source IDs
      for (const [start, , length] of rldsMapping.bible.runs) {
        for (let i = 0; i < length; i++) {
          const id = start + i;
          expect(sourceIds.has(id)).toBe(false);
          sourceIds.add(id);
        }
      }
      for (const [source] of rldsMapping.bible.singles) {
        expect(sourceIds.has(source)).toBe(false);
        sourceIds.add(source);
      }
      for (const [source] of rldsMapping.bible.multi) {
        expect(sourceIds.has(source)).toBe(false);
        sourceIds.add(source);
      }
    });
  });

  describe('LDS Mapping (COC BOM ↔ LDS BOM)', () => {
    const COC_BOM_RANGE = { min: 31334, max: 39975 };
    const LDS_BOM_RANGE = { min: 31103, max: 37706 };

    test('all runs have valid format [start, target, length]', () => {
      for (const run of rldsMapping.lds.runs) {
        expect(Array.isArray(run)).toBe(true);
        expect(run.length).toBe(3);
        expect(typeof run[0]).toBe('number');
        expect(typeof run[1]).toBe('number');
        expect(typeof run[2]).toBe('number');
        expect(run[2]).toBeGreaterThan(0);
      }
    });

    test('all singles have valid format [source, target]', () => {
      for (const single of rldsMapping.lds.singles) {
        expect(Array.isArray(single)).toBe(true);
        expect(single.length).toBe(2);
        expect(typeof single[0]).toBe('number');
        expect(typeof single[1]).toBe('number');
      }
    });

    test('all multi have valid format [source, [targets]]', () => {
      for (const multi of rldsMapping.lds.multi) {
        expect(Array.isArray(multi)).toBe(true);
        expect(multi.length).toBe(2);
        expect(typeof multi[0]).toBe('number');
        expect(Array.isArray(multi[1])).toBe(true);
        expect(multi[1].length).toBeGreaterThan(0);
        for (const target of multi[1]) {
          expect(typeof target).toBe('number');
        }
      }
    });

    test('all source IDs within COC BOM range', () => {
      for (const [start, , length] of rldsMapping.lds.runs) {
        expect(start).toBeGreaterThanOrEqual(COC_BOM_RANGE.min);
        expect(start + length - 1).toBeLessThanOrEqual(COC_BOM_RANGE.max);
      }
      for (const [source] of rldsMapping.lds.singles) {
        expect(source).toBeGreaterThanOrEqual(COC_BOM_RANGE.min);
        expect(source).toBeLessThanOrEqual(COC_BOM_RANGE.max);
      }
      for (const [source] of rldsMapping.lds.multi) {
        expect(source).toBeGreaterThanOrEqual(COC_BOM_RANGE.min);
        expect(source).toBeLessThanOrEqual(COC_BOM_RANGE.max);
      }
    });

    test('all target IDs within LDS BOM range', () => {
      for (const [, target, length] of rldsMapping.lds.runs) {
        expect(target).toBeGreaterThanOrEqual(LDS_BOM_RANGE.min);
        expect(target + length - 1).toBeLessThanOrEqual(LDS_BOM_RANGE.max);
      }
      for (const [, target] of rldsMapping.lds.singles) {
        expect(target).toBeGreaterThanOrEqual(LDS_BOM_RANGE.min);
        expect(target).toBeLessThanOrEqual(LDS_BOM_RANGE.max);
      }
      for (const [, targets] of rldsMapping.lds.multi) {
        for (const target of targets) {
          expect(target).toBeGreaterThanOrEqual(LDS_BOM_RANGE.min);
          expect(target).toBeLessThanOrEqual(LDS_BOM_RANGE.max);
        }
      }
    });

    test('complete coverage: no gaps in source IDs', () => {
      const sourceIds = new Set();

      for (const [start, , length] of rldsMapping.lds.runs) {
        for (let i = 0; i < length; i++) {
          sourceIds.add(start + i);
        }
      }
      for (const [source] of rldsMapping.lds.singles) {
        sourceIds.add(source);
      }
      for (const [source] of rldsMapping.lds.multi) {
        sourceIds.add(source);
      }

      // Check for complete coverage
      const expectedCount = COC_BOM_RANGE.max - COC_BOM_RANGE.min + 1;
      expect(sourceIds.size).toBe(expectedCount);

      // Check no gaps
      for (let id = COC_BOM_RANGE.min; id <= COC_BOM_RANGE.max; id++) {
        expect(sourceIds.has(id)).toBe(true);
      }
    });

    test('complete coverage: no gaps in target IDs', () => {
      const targetIds = new Set();

      for (const [, target, length] of rldsMapping.lds.runs) {
        for (let i = 0; i < length; i++) {
          targetIds.add(target + i);
        }
      }
      for (const [, target] of rldsMapping.lds.singles) {
        targetIds.add(target);
      }
      for (const [, targets] of rldsMapping.lds.multi) {
        for (const target of targets) {
          targetIds.add(target);
        }
      }

      // Check for complete coverage
      const expectedCount = LDS_BOM_RANGE.max - LDS_BOM_RANGE.min + 1;
      expect(targetIds.size).toBe(expectedCount);

      // Check no gaps
      for (let id = LDS_BOM_RANGE.min; id <= LDS_BOM_RANGE.max; id++) {
        expect(targetIds.has(id)).toBe(true);
      }
    });

    test('no overlapping source IDs', () => {
      const sourceIds = new Set();

      for (const [start, , length] of rldsMapping.lds.runs) {
        for (let i = 0; i < length; i++) {
          const id = start + i;
          expect(sourceIds.has(id)).toBe(false);
          sourceIds.add(id);
        }
      }
      for (const [source] of rldsMapping.lds.singles) {
        expect(sourceIds.has(source)).toBe(false);
        sourceIds.add(source);
      }
      for (const [source] of rldsMapping.lds.multi) {
        expect(sourceIds.has(source)).toBe(false);
        sourceIds.add(source);
      }
    });
  });

  describe('Bidirectional Consistency', () => {
    test('LDS mapping: every source maps to at least one target', () => {
      const lds = rldsMapping.lds;

      for (const [, , length] of lds.runs) {
        expect(length).toBeGreaterThan(0);
      }
      for (const [, target] of lds.singles) {
        expect(target).toBeDefined();
      }
      for (const [, targets] of lds.multi) {
        expect(targets.length).toBeGreaterThan(0);
      }
    });

    test('LDS mapping: every target is reachable', () => {
      const targetIds = new Set();

      for (const [, target, length] of rldsMapping.lds.runs) {
        for (let i = 0; i < length; i++) {
          targetIds.add(target + i);
        }
      }
      for (const [, target] of rldsMapping.lds.singles) {
        targetIds.add(target);
      }
      for (const [, targets] of rldsMapping.lds.multi) {
        for (const target of targets) {
          targetIds.add(target);
        }
      }

      // All LDS BOM verses should be reachable
      const LDS_BOM_RANGE = { min: 31103, max: 37706 };
      for (let id = LDS_BOM_RANGE.min; id <= LDS_BOM_RANGE.max; id++) {
        expect(targetIds.has(id)).toBe(true);
      }
    });
  });
});
