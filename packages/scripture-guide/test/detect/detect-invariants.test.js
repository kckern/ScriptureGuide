/**
 * Invariant coverage for detectReferences, driven over every corpus we have.
 *
 * These assert PROPERTIES rather than values, so they cannot be satisfied by
 * re-baselining. See test/helpers/detect-invariants.js for the three invariants
 * and why they exist.
 *
 * Run against BOTH builds: `src` is the source of truth, `dist` is what ships.
 * `npm run test:jest` has no prebuild step and dist/ is gitignored, so a stale
 * bundle can otherwise pass the snapshot suite while src changes go unverified.
 * Checking both means a stale dist shows up as a failure here.
 */
import * as srcModule from '../../src/scriptures.mjs';
import * as distModule from '../../dist/scriptures.mjs';
import { loadFixtures, getTestCases, isQuarantined } from '../helpers/fixture-loader.js';
import { loadProseSample } from '../helpers/fixture-loader.js';
import { assertDetectInvariants } from '../helpers/detect-invariants.js';

const BUILDS = [['src', srcModule], ['dist', distModule]];
const CONTEXT_MODES = [true, false];

const fixtures = loadFixtures();
// A case quarantined for the value tests must be quarantined here too, or the
// suite contradicts itself: the invariant sweep would fail on exactly the inputs
// we have already documented as unsupported.
const detectCases = [
  ...getTestCases(fixtures, 'detect', 'critical'),
  ...getTestCases(fixtures, 'detect', 'edge_cases'),
  ...getTestCases(fixtures, 'detect', 'negative'),
].filter(tc => !isQuarantined(tc));
const lookupCases = getTestCases(fixtures, 'lookup', 'critical').filter(tc => !isQuarantined(tc));

const PROSE_SAMPLES = [
  ['en', 'testDetect.en.txt'],
  ['en', 'vvtest-en.txt'],
  ['ko', 'vvtest-ko.txt'],
];

describe.each(BUILDS)('detect invariants (%s build)', (buildName, mod) => {
  const deps = { detectReferences: mod.detectReferences, lookupReference: mod.lookupReference };

  describe('prose samples', () => {
    test.each(
      PROSE_SAMPLES.flatMap(([lang, file]) =>
        CONTEXT_MODES.map(ctx => [`${file} contextAware:${ctx}`, lang, file, ctx])
      )
    )('%s', (_label, lang, file, contextAware) => {
      const content = loadProseSample(lang, file);
      expect(() =>
        assertDetectInvariants(deps, content, { language: lang, contextAware })
      ).not.toThrow();
    });
  });

  describe('every detect fixture input', () => {
    test.each(CONTEXT_MODES)('contextAware: %s', (contextAware) => {
      const failures = [];
      for (const tc of detectCases) {
        if (typeof tc.input !== 'string') continue;
        try {
          assertDetectInvariants(deps, tc.input, {
            language: tc.language || 'en',
            contextAware,
          });
        } catch (err) {
          failures.push(`${tc.id}: ${err.message}`);
        }
      }
      expect(failures).toEqual([]);
    });
  });

  // Lookup inputs are reference strings rather than prose, which exercises spans
  // that start at offset 0 and end at the very end of the content -- the
  // boundary cases where span arithmetic is most likely to be off by one.
  describe('every lookup fixture input, treated as content', () => {
    test.each(CONTEXT_MODES)('contextAware: %s', (contextAware) => {
      const failures = [];
      for (const tc of lookupCases) {
        if (typeof tc.input !== 'string') continue;
        try {
          assertDetectInvariants(deps, tc.input, {
            language: tc.language || 'en',
            contextAware,
          });
        } catch (err) {
          failures.push(`${tc.id} (${JSON.stringify(tc.input)}): ${err.message}`);
        }
      }
      expect(failures).toEqual([]);
    });
  });
});
