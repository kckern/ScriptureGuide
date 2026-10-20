import { lookupReference } from '../../dist/scriptures.mjs';
import { loadFixtures, getTestCases } from '../helpers/fixture-loader.js';

const fixtures = loadFixtures();
const knownIssues = getTestCases(fixtures, 'lookup', 'known_issues');

describe('lookupReference - Known Issues', () => {
  if (knownIssues.length === 0) {
    test.skip('No known issues currently tracked', () => {});
  } else {
    describe.each(knownIssues)('$id: $issue', (tc) => {
      test.failing(`should return ${JSON.stringify(tc.expected_ids)} (${tc.github_issue || 'no issue'})`, () => {
        const result = lookupReference(tc.input, tc.language);
        expect(result.verse_ids).toEqual(tc.expected_ids);
      });
    });
  }
});
