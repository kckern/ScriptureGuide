import { generateReference } from '../../dist/scriptures.mjs';
import { loadFixtures, getTestCases } from '../helpers/fixture-loader.js';

const fixtures = loadFixtures();
const edgeCases = getTestCases(fixtures, 'generate', 'edge_cases');

describe('generateReference - Edge Cases', () => {
  if (edgeCases.length === 0) {
    test.skip('No edge cases currently defined', () => {});
  } else {
    describe.each(edgeCases)('$id: $description [$tags]', (tc) => {
      test('generates expected reference string', () => {
        const result = generateReference(tc.input_ids, tc.language);
        expect(result).toBe(tc.expected);
      });
    });
  }
});
