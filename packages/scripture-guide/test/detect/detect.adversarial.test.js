/**
 * Adversarial detect cases: hostile spacing, doubled punctuation, string
 * boundaries, unicode, and inputs that must NOT be detected.
 *
 * Unlike the prose samples, these are hand-written and small enough that the
 * correct answer is obvious by inspection -- which is exactly what a snapshot of
 * a real document cannot give you. The callback renders the VERBATIM matched
 * span rather than the canonical reference, because these assert span
 * arithmetic, not lookup.
 *
 * Quarantine here is per-context-variation, not per-case: several inputs behave
 * correctly under contextAware:true and reproduce a known defect under
 * contextAware:false.
 */
import { detectReferences, lookupReference } from '../../src/scriptures.mjs';
import { loadFixtures, getTestCases } from '../helpers/fixture-loader.js';
import { assertDetectInvariants } from '../helpers/detect-invariants.js';

const fixtures = loadFixtures();
const cases = getTestCases(fixtures, 'detect', 'adversarial');
const CONTEXT_MODES = [
  ['contextAware_true', true],
  ['contextAware_false', false],
];

describe('detectReferences - Adversarial', () => {
  test('the adversarial corpus is wired up', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  describe.each(cases)('$id: $description', (tc) => {
    describe.each(CONTEXT_MODES)('%s', (key, contextAware) => {
      const variation = tc.context_variations?.[key];
      const quarantined = variation?.known_issue?.trim();
      const runTest = quarantined
        ? (name, fn) => test.skip(`${name} [known issue: ${quarantined}]`, fn)
        : test;

      runTest('renders the expected spans', () => {
        expect(variation).toBeDefined();
        const result = detectReferences(
          tc.input,
          (text) => `[${text}]`,
          { language: tc.language || 'en', contextAware }
        );
        expect(result).toBe(variation.expected_output);
      });

      runTest('satisfies the detect invariants', () => {
        expect(() =>
          assertDetectInvariants(
            { detectReferences, lookupReference },
            tc.input,
            { language: tc.language || 'en', contextAware }
          )
        ).not.toThrow();
      });
    });
  });
});
