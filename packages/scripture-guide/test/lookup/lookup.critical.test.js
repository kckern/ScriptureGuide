import { lookupReference } from '../../dist/scriptures.mjs';
import { loadFixtures, getTestCases, knownIssue } from '../helpers/fixture-loader.js';

const fixtures = loadFixtures();
const criticalCases = getTestCases(fixtures, 'lookup', 'critical');
const invalidCases = getTestCases(fixtures, 'lookup', 'invalid');
// Numbered books ("1 Kings 2:3", "I John 1:1") are their own fixture file. It
// loaded but no test read the tier, so all 22 cases sat unexecuted.
const numberedBookCases = getTestCases(fixtures, 'lookup', 'numbered-books');
// Reference-format variations (delimiters, spacing, abbreviation styles). Same
// story: the file loaded, no test read the tier.
const formatCases = getTestCases(fixtures, 'lookup', 'formats');

describe('lookupReference - Critical', () => {
  describe.each(criticalCases)('$id: $description', (tc) => {
    const quarantined = knownIssue(tc);
    const runTest = quarantined
      ? (name, fn) => test.skip(`${name} [known issue: ${quarantined}]`, fn)
      : test;

    runTest('returns correct verse IDs', () => {
      const result = lookupReference(tc.input, tc.language);
      expect(result.verse_ids).toEqual(tc.expected_ids);
    });

    runTest('generates canonical reference', () => {
      const result = lookupReference(tc.input, tc.language);
      expect(result.ref).toBe(tc.expected_ref);
    });
  });
});

describe('lookupReference - Invalid Inputs', () => {
  describe.each(invalidCases)('$id: $description', (tc) => {
    test('returns empty for invalid input', () => {
      const result = lookupReference(tc.input, tc.language);
      expect(result.verse_ids).toEqual([]);
    });
  });
});

describe('lookupReference - Numbered Books', () => {
  describe.each(numberedBookCases)('$id: $description', (tc) => {
    const quarantined = knownIssue(tc);
    const runTest = quarantined
      ? (name, fn) => test.skip(`${name} [known issue: ${quarantined}]`, fn)
      : test;

    runTest('returns correct verse IDs', () => {
      const result = lookupReference(tc.input, tc.language);
      expect(result.verse_ids).toEqual(tc.expected_ids);
    });

    runTest('generates canonical reference', () => {
      const result = lookupReference(tc.input, tc.language);
      expect(result.ref).toBe(tc.expected_ref);
    });
  });
});

describe('lookupReference - Reference Formats', () => {
  describe.each(formatCases)('$id: $description', (tc) => {
    const quarantined = knownIssue(tc);
    const runTest = quarantined
      ? (name, fn) => test.skip(`${name} [known issue: ${quarantined}]`, fn)
      : test;

    runTest('returns correct verse IDs', () => {
      const result = lookupReference(tc.input, tc.language);
      expect(result.verse_ids).toEqual(tc.expected_ids);
    });

    runTest('generates canonical reference', () => {
      const result = lookupReference(tc.input, tc.language);
      expect(result.ref).toBe(tc.expected_ref);
    });
  });
});
