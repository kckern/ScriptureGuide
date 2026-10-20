import { lookupReference, generateReference } from '../../dist/scriptures.mjs';
import { loadFixtures, getTestCases, knownIssue } from '../helpers/fixture-loader.js';

const fixtures = loadFixtures();
const lookupCases = getTestCases(fixtures, 'lookup', 'critical');

describe('Round-trip Verification - Critical', () => {
  describe.each(lookupCases)('$id: $input', (tc) => {
    const quarantined = knownIssue(tc);
    const runTest = quarantined
      ? (name, fn) => test.skip(`${name} [known issue: ${quarantined}]`, fn)
      : test;

    runTest('lookup → generate → lookup returns same IDs', () => {
      // Forward: input → verse IDs
      const forward = lookupReference(tc.input, tc.language);
      expect(forward.verse_ids.length).toBeGreaterThan(0);

      // Generate: verse IDs → canonical reference
      const canonical = generateReference(forward.verse_ids, tc.language);
      expect(canonical).toBeTruthy();

      // Backward: canonical → verse IDs (must match)
      const backward = lookupReference(canonical, tc.language);
      expect(backward.verse_ids).toEqual(forward.verse_ids);
    });

    runTest('generate produces canonical form', () => {
      const forward = lookupReference(tc.input, tc.language);
      const canonical = generateReference(forward.verse_ids, tc.language);
      expect(canonical).toBe(tc.expected_ref);
    });
  });
});
