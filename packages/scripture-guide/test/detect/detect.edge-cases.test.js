import { detectReferences, generateReference } from '../../dist/scriptures.mjs';
import { loadFixtures, getTestCases, UNIMPLEMENTED_FEATURES } from '../helpers/fixture-loader.js';

const fixtures = loadFixtures();
const edgeCases = getTestCases(fixtures, 'detect', 'edge_cases');


describe('detectReferences - Edge Cases', () => {
  if (edgeCases.length === 0) {
    test.skip('No edge cases currently defined', () => {});
  } else {
    describe.each(edgeCases)('$id: $description [$tags]', (tc) => {
      const hasUnimplementedFeature = tc.tags?.some(tag =>
        UNIMPLEMENTED_FEATURES.includes(tag)
      );

      if (hasUnimplementedFeature) {
        test.skip(`detects expected references (requires: ${tc.tags.filter(t => UNIMPLEMENTED_FEATURES.includes(t)).join(', ')})`, () => {});
      } else {
        test('detects expected references', () => {
          const foundRefs = [];

          detectReferences(
            tc.input,
            (text, ids) => {
              foundRefs.push(generateReference(ids, tc.language));
              return `[${text}]`;
            },
            { language: tc.language, contextAware: true }
          );

          expect(foundRefs).toEqual(tc.expected_refs);
        });
      }
    });
  }
});
