// test/test-canon-integration.js
import { lookupReference, generateReference } from '../src/scriptures.mjs';

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

// Basic LDS lookup (unchanged behavior)
test('lookupReference works without canon option (LDS default)', () => {
  const result = lookupReference('1 Nephi 1:1');
  if (!result.verse_ids.includes(31103)) throw new Error('Expected verse_id 31103');
});

// COC lookup
test('lookupReference with canon:"coc" returns C-prefixed ids', () => {
  const result = lookupReference('1 Nephi 1:1', 'en', { canon: 'coc' });
  if (!result.verse_ids[0]?.startsWith('C')) throw new Error('Expected C-prefixed id');
});

// convertTo option
test('lookupReference with convertTo converts result', () => {
  const result = lookupReference('1 Nephi 1:1', 'en', { canon: 'coc', convertTo: 'lds' });
  if (typeof result.verse_ids[0] !== 'number') throw new Error('Expected LDS integer id');
  if (result.sourceCanon !== 'coc') throw new Error('Expected sourceCanon: coc');
});

// includeParallel option
test('lookupReference with includeParallel includes both canons', () => {
  const result = lookupReference('1 Nephi 1:1', 'en', { canon: 'coc', includeParallel: true });
  if (!result.parallel) throw new Error('Expected parallel object');
  if (result.parallel.canon !== 'lds') throw new Error('Expected parallel.canon: lds');
});

// generateReference with COC ids
test('generateReference auto-detects COC ids', () => {
  const result = generateReference(['C00001', 'C00002']);
  if (!result.includes('1 Nephi')) throw new Error('Expected 1 Nephi in result');
});

run();
