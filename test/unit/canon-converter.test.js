// test/unit/canon-converter.test.js
import { detectCanon, formatCocId, parseCocId, convertCanon, convertToLds, convertToCoc } from '../../src/canon-converter.mjs';

describe('Canon Converter', () => {
  describe('detectCanon', () => {
    test('detects LDS from integer', () => {
      expect(detectCanon(1000)).toBe('lds');
    });

    test('detects LDS from numeric string', () => {
      expect(detectCanon('31103')).toBe('lds');
    });

    test('detects COC from C-prefixed string', () => {
      expect(detectCanon('C00001')).toBe('coc');
    });

    test('returns null for invalid input', () => {
      expect(detectCanon('invalid')).toBeNull();
    });

    test('returns null for empty string', () => {
      expect(detectCanon('')).toBeNull();
    });
  });

  describe('formatCocId', () => {
    test('pads single digit to 5 digits', () => {
      expect(formatCocId(1)).toBe('C00001');
    });

    test('pads two digits to 5 digits', () => {
      expect(formatCocId(50)).toBe('C00050');
    });

    test('pads four digits to 5 digits', () => {
      expect(formatCocId(6839)).toBe('C06839');
    });

    test('handles 5 digit numbers', () => {
      expect(formatCocId(12345)).toBe('C12345');
    });
  });

  describe('parseCocId', () => {
    test('extracts number from C00001', () => {
      expect(parseCocId('C00001')).toBe(1);
    });

    test('extracts number from C00050', () => {
      expect(parseCocId('C00050')).toBe(50);
    });

    test('extracts number from C06839', () => {
      expect(parseCocId('C06839')).toBe(6839);
    });
  });

  describe('convertCanon', () => {
    test('returns same IDs when from === to', async () => {
      const result = await convertCanon([1, 2, 3], { from: 'lds', to: 'lds' });
      expect(result.verse_ids).toEqual([1, 2, 3]);
      expect(result.partial).toBe(false);
    });

    test('returns same IDs when no target specified', async () => {
      const result = await convertCanon([1, 2, 3], { from: 'lds' });
      expect(result.verse_ids).toEqual([1, 2, 3]);
      expect(result.partial).toBe(false);
    });

    test('auto-detects COC source and converts to LDS', async () => {
      const result = await convertCanon(['C00002'], { to: 'lds' });
      expect(result.verse_ids).toContain(31105);
      expect(result.partial).toBe(false);
    });

    test('auto-detects LDS source and converts to COC', async () => {
      const result = await convertCanon([31105], { to: 'coc' });
      expect(result.verse_ids).toContain('C00002');
      expect(result.partial).toBe(false);
    });

    test('handles partial mappings from COC to LDS', async () => {
      // COC verse 9 maps to LDS [31112, 31113] with partial=true
      const result = await convertCanon(['C00009'], { from: 'coc', to: 'lds' });
      expect(result.verse_ids.length).toBe(2);
      expect(result.verse_ids).toContain(31112);
      expect(result.verse_ids).toContain(31113);
      expect(result.partial).toBe(true);
    });

    test('handles partial mappings from LDS to COC', async () => {
      // LDS verses 31112, 31113 both map to COC 9
      const result = await convertCanon([31112, 31113], { from: 'lds', to: 'coc' });
      expect(result.verse_ids.length).toBe(1);
      expect(result.verse_ids).toContain('C00009');
      expect(result.partial).toBe(true);
    });

    test('returns empty for unknown COC id', async () => {
      const result = await convertCanon(['C99999'], { from: 'coc', to: 'lds' });
      expect(result.verse_ids).toEqual([]);
    });

    test('returns empty for unknown LDS id', async () => {
      const result = await convertCanon([999999], { from: 'lds', to: 'coc' });
      expect(result.verse_ids).toEqual([]);
    });
  });

  describe('convertToLds (backward compatibility)', () => {
    test('converts single COC id', async () => {
      const result = await convertToLds(['C00002']);
      expect(result.verse_ids[0]).toBe(31105);
      expect(result.partial).toBe(false);
    });

    test('expands partial mapping', async () => {
      const result = await convertToLds(['C00009']);
      expect(result.verse_ids.length).toBe(2);
      expect(result.partial).toBe(true);
    });

    test('handles multiple COC ids', async () => {
      const result = await convertToLds(['C00009', 'C00010']);
      expect(result.verse_ids.length).toBe(3);
      expect(result.partial).toBe(true);
    });
  });

  describe('convertToCoc (backward compatibility)', () => {
    test('converts single LDS id', async () => {
      const result = await convertToCoc([31105]);
      expect(result.verse_ids[0]).toBe('C00002');
      expect(result.partial).toBe(false);
    });

    test('deduplicates partial mappings', async () => {
      const result = await convertToCoc([31112, 31113]);
      expect(result.verse_ids.length).toBe(1);
      expect(result.verse_ids[0]).toBe('C00009');
      expect(result.partial).toBe(true);
    });

    test('handles multiple LDS ids', async () => {
      const result = await convertToCoc([31105, 31106]);
      expect(result.verse_ids.length).toBe(2);
    });
  });
});
