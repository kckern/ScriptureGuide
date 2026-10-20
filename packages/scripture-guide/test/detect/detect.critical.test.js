import { detectReferences, generateReference } from '../../dist/scriptures.mjs';
import { loadFixtures, getTestCases } from '../helpers/fixture-loader.js';

const fixtures = loadFixtures();
const criticalCases = getTestCases(fixtures, 'detect', 'critical');

describe('detectReferences - Critical', () => {
  describe.each(criticalCases)('$id: $description', (tc) => {
    test('contextAware: true', () => {
      const variation = tc.context_variations?.contextAware_true;
      if (!variation) {
        return; // Skip if no variation defined
      }

      const result = detectReferences(
        tc.input,
        (text, ids) => `[${generateReference(ids, tc.language)}]`,
        { language: tc.language, contextAware: true }
      );
      expect(result).toBe(variation.expected_output);
    });

    test('contextAware: false', () => {
      const variation = tc.context_variations?.contextAware_false;
      if (!variation) {
        return; // Skip if no variation defined
      }

      const result = detectReferences(
        tc.input,
        (text, ids) => `[${generateReference(ids, tc.language)}]`,
        { language: tc.language, contextAware: false }
      );
      expect(result).toBe(variation.expected_output);
    });
  });
});
