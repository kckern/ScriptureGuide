import { lookupReference } from '../../dist/scriptures.mjs';
import { loadFixtures, getTestCases, knownIssue } from '../helpers/fixture-loader.js';

const fixtures = loadFixtures();
const edgeCases = getTestCases(fixtures, 'lookup', 'edge_cases');

describe('lookupReference - Edge Cases', () => {
  describe.each(edgeCases)('$id: $description [$tags]', (tc) => {
    const quarantined = knownIssue(tc);
    const runTest = quarantined
      ? (name, fn) => test.skip(`${name} [known issue: ${quarantined}]`, fn)
      : test;

    runTest('returns correct verse IDs despite formatting', () => {
      const result = lookupReference(tc.input, tc.language);
      expect(result.verse_ids).toEqual(tc.expected_ids);
    });

    runTest('normalizes to canonical reference', () => {
      const result = lookupReference(tc.input, tc.language);
      expect(result.ref).toBe(tc.expected_ref);
    });
  });
});
