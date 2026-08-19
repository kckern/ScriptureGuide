/**
 * Negative detection tests - text that should NOT be detected as scripture references
 * These test false positive prevention
 */
import { detectReferences, generateReference } from '../../dist/scriptures.mjs';
import { loadFixtures, getTestCases, knownIssue } from '../helpers/fixture-loader.js';

const fixtures = loadFixtures('en');
const negativeCases = getTestCases(fixtures, 'detect', 'negative');

describe('detectReferences - Negative Cases (False Positive Prevention)', () => {
  if (negativeCases.length === 0) {
    test.skip('No negative cases currently defined', () => {});
  } else {
    describe.each(negativeCases)('$id: $description', (tc) => {
      const quarantined = knownIssue(tc);
      const runTest = quarantined
        ? (name, fn) => test.skip(`${name} [known issue: ${quarantined}]`, fn)
        : test;

      runTest('should NOT detect any references', () => {
        const foundRefs = [];

        detectReferences(
          tc.input,
          (text, ids) => {
            foundRefs.push({
              text,
              canonical: generateReference(ids, tc.language || 'en')
            });
            return `[${text}]`;
          },
          { language: tc.language || 'en', contextAware: true }
        );

        // For negative cases, we expect NO references to be found
        if (foundRefs.length > 0) {
          // Provide helpful failure message showing what was incorrectly detected
          const detected = foundRefs.map(r => `"${r.text}" → ${r.canonical}`).join(', ');
          expect(foundRefs).toEqual([]);
          // This line won't run but provides context in error message:
          // console.log(`False positive in "${tc.input}": detected ${detected}`);
        } else {
          expect(foundRefs).toEqual([]);
        }
      });
    });
  }
});
