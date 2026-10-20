import { generateReference } from '../../dist/scriptures.mjs';
import { loadFixtures, getTestCases } from '../helpers/fixture-loader.js';

const fixtures = loadFixtures();
const criticalCases = getTestCases(fixtures, 'generate', 'critical');

describe('generateReference - Critical', () => {
  describe.each(criticalCases)('$id: $description', (tc) => {
    test('generates expected reference string', () => {
      const result = generateReference(tc.input_ids, tc.language);
      expect(result).toBe(tc.expected);
    });
  });
});
