// test/test-scriptcanon.js
import { detectCanon, formatCocId, parseCocId, convertToLds, convertToCoc, convertCanon } from '../src/scriptcanon.mjs';
import cocMapping from '../data/coc-mapping.mjs';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const run = () => {
  let passed = 0, failed = 0;
  for (const t of tests) {
    try {
      t.fn();
      console.log(`✓ ${t.name}`);
      passed++;
    } catch (e) {
      console.log(`✗ ${t.name}: ${e.message}`);
      failed++;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
};

// detectCanon tests
test('detectCanon returns "coc" for C-prefixed string', () => {
  if (detectCanon('C00001') !== 'coc') throw new Error('Expected coc');
});

test('detectCanon returns "lds" for integer', () => {
  if (detectCanon(31103) !== 'lds') throw new Error('Expected lds');
});

test('detectCanon returns "lds" for numeric string', () => {
  if (detectCanon('31103') !== 'lds') throw new Error('Expected lds');
});

test('detectCanon returns null for invalid input', () => {
  if (detectCanon('invalid') !== null) throw new Error('Expected null');
});

// formatCocId tests
test('formatCocId pads to 5 digits', () => {
  if (formatCocId(1) !== 'C00001') throw new Error('Expected C00001');
  if (formatCocId(50) !== 'C00050') throw new Error('Expected C00050');
  if (formatCocId(6839) !== 'C06839') throw new Error('Expected C06839');
});

// parseCocId tests
test('parseCocId extracts number', () => {
  if (parseCocId('C00001') !== 1) throw new Error('Expected 1');
  if (parseCocId('C00050') !== 50) throw new Error('Expected 50');
  if (parseCocId('C06839') !== 6839) throw new Error('Expected 6839');
});

// coc-mapping tests
test('coc-mapping has cocToLds object', () => {
  if (typeof cocMapping.cocToLds !== 'object') throw new Error('Missing cocToLds');
});

test('coc-mapping has ldsToCoc object', () => {
  if (typeof cocMapping.ldsToCoc !== 'object') throw new Error('Missing ldsToCoc');
});

test('coc-mapping sample entry exists', () => {
  if (!cocMapping.cocToLds[1]) throw new Error('Missing entry for COC verse 1');
});

// convertToLds tests
test('convertToLds converts single COC id', () => {
  const result = convertToLds(['C00002']);
  if (result.verse_ids[0] !== 31105) throw new Error(`Expected 31105, got ${result.verse_ids[0]}`);
  if (result.partial !== false) throw new Error('Expected partial: false');
});

test('convertToLds expands partial mapping', () => {
  // COC verse 9 maps to LDS [31112, 31113] in real data
  const result = convertToLds(['C00009']);
  if (result.verse_ids.length !== 2) throw new Error(`Expected 2 verses, got ${result.verse_ids.length}`);
  if (result.verse_ids[0] !== 31112) throw new Error('Expected 31112 first');
  if (result.verse_ids[1] !== 31113) throw new Error('Expected 31113 second');
  if (result.partial !== true) throw new Error('Expected partial: true');
});

test('convertToLds handles multiple COC ids', () => {
  // COC 9 is partial (2 verses), COC 10 is exact (1 verse)
  const result = convertToLds(['C00009', 'C00010']);
  if (result.verse_ids.length !== 3) throw new Error(`Expected 3 verses, got ${result.verse_ids.length}`);
  if (result.partial !== true) throw new Error('Expected partial: true (from C00009)');
});

test('convertToLds returns empty for unknown id', () => {
  const result = convertToLds(['C99999']);
  if (result.verse_ids.length !== 0) throw new Error('Expected empty array');
});

// convertToCoc tests
test('convertToCoc converts single LDS id', () => {
  const result = convertToCoc([31105]);
  if (result.verse_ids[0] !== 'C00002') throw new Error(`Expected C00002, got ${result.verse_ids[0]}`);
  if (result.partial !== false) throw new Error('Expected partial: false');
});

test('convertToCoc deduplicates partial mappings', () => {
  // Both 31112 and 31113 map to COC 9 in real data
  const result = convertToCoc([31112, 31113]);
  if (result.verse_ids.length !== 1) throw new Error(`Expected 1 verse, got ${result.verse_ids.length}`);
  if (result.verse_ids[0] !== 'C00009') throw new Error('Expected C00009');
  if (result.partial !== true) throw new Error('Expected partial: true');
});

test('convertToCoc handles multiple LDS ids', () => {
  const result = convertToCoc([31105, 31106]);
  if (result.verse_ids.length !== 2) throw new Error(`Expected 2 verses, got ${result.verse_ids.length}`);
});

test('convertToCoc returns empty for unknown id', () => {
  const result = convertToCoc([999999]);
  if (result.verse_ids.length !== 0) throw new Error('Expected empty array');
});

// convertCanon tests
test('convertCanon auto-detects COC and converts to LDS', () => {
  const result = convertCanon(['C00002'], { to: 'lds' });
  if (result.verse_ids[0] !== 31105) throw new Error('Expected 31105');
});

test('convertCanon auto-detects LDS and converts to COC', () => {
  const result = convertCanon([31105], { to: 'coc' });
  if (result.verse_ids[0] !== 'C00002') throw new Error('Expected C00002');
});

test('convertCanon returns error for mixed input', () => {
  const result = convertCanon(['C00001', 31105], { to: 'lds' });
  if (!result.error) throw new Error('Expected error for mixed input');
  if (result.error !== 'mixed_canon_input') throw new Error('Expected mixed_canon_input error');
});

test('convertCanon returns error for same-canon conversion', () => {
  const result = convertCanon(['C00001'], { to: 'coc' });
  if (!result.error) throw new Error('Expected error for same-canon');
});

run();
