/**
 * Implied-book binding for a bare "chapter:verse".
 *
 * A bare number pair carries no marker declaring it a citation, so it inherits
 * a book from an earlier reference only when the token immediately before it is
 * citation material. See docs/plans/2026-08-19-implied-book-context-design.md.
 */
import { findReferences, detectReferences, lookupReference } from '../../dist/scriptures.mjs';
import { loadFixtures, getTestCases, knownIssue } from '../helpers/fixture-loader.js';
import { assertDetectInvariants } from '../helpers/detect-invariants.js';

const cases = getTestCases(loadFixtures('en'), 'detect', 'implied-book');

describe('implied-book binding (fixtures)', () => {
  if (!cases.length) throw new Error('implied-book fixtures failed to load');

  describe.each(cases)('$id: $description', (tc) => {
    const quarantined = knownIssue(tc);
    const runTest = quarantined
      ? (name, fn) => test.skip(`${name} [known issue: ${quarantined}]`, fn)
      : test;
    const options = { language: tc.language || 'en', contextAware: true };
    const refs = () => findReferences(tc.input, options).map(r => r.ref);

    if (tc.expect_refs) {
      runTest('binds exactly the expected references', () => {
        expect(refs()).toEqual(tc.expect_refs);
      });
    }

    // Assert on resolved verse ids, not ref strings: adjacent references are
    // emitted in merged canonical form ("Jeremiah 23:5; 33:15"), so a substring
    // check on the ref would depend on how the merge happened to group them.
    if (tc.expect_contains) {
      runTest('still binds the legitimate continuation', () => {
        const got = new Set(findReferences(tc.input, options).flatMap(r => r.verse_ids));
        for (const want of tc.expect_contains) {
          const ids = lookupReference(want).verse_ids;
          expect(ids.length).toBeGreaterThan(0);
          expect(ids.every(id => got.has(id))).toBe(true);
        }
      });
    }

    if (tc.expect_absent) {
      runTest('does not bind the spurious reference', () => {
        const joined = refs().join(' | ');
        for (const nope of tc.expect_absent) expect(joined).not.toContain(nope);
      });
    }

    const invariantTest = tc.skip_invariants
      ? (name, fn) => test.skip(`${name} [pre-existing: ${tc.skip_invariants.trim()}]`, fn)
      : runTest;
    invariantTest('holds the detect invariants', () => {
      assertDetectInvariants({ detectReferences, lookupReference }, tc.input, options);
    });
  });
});

describe('strictImpliedBooks opt-out', () => {
  const INPUT = 'Job 23:10; Teachings of the Prophet Joseph Smith, p. 185; Lectures on Faith, 6:3';

  test('defaults to the strict binding', () => {
    expect(findReferences(INPUT).map(r => r.ref)).toEqual(['Job 23:10']);
  });

  test('false restores distance-only binding for consumers who need it', () => {
    const refs = findReferences(INPUT, { strictImpliedBooks: false }).map(r => r.ref);
    expect(refs).toContain('Job 6:3');
  });
});
