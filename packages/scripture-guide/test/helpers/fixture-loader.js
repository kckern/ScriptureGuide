import { readFileSync } from 'fs';
import { load as parse } from 'js-yaml';
import { glob } from 'glob';

/**
 * Filename stem -> tier key. Files on disk use kebab-case; the aggregated
 * fixtures and every test consumer use snake_case tier keys.
 */
const TIER_KEYS = {
  'edge-cases': 'edge_cases',
  'known-issues': 'known_issues',
};

const tierKey = (stem) => TIER_KEYS[stem] || stem;

/**
 * Enumerate every fixture file on disk, both layouts.
 *
 * Two layouts coexist:
 *   test/fixtures/<lang>.yml                  - aggregated, { lookup: { critical: [...] } }
 *   test/fixtures/<lang>/<fn>/<tier>.yml      - per-tier,   { tests: [...] }
 *
 * The per-tier files are the source of truth; the aggregated files are a stale
 * partial copy retained for languages that have no per-tier directory (ko).
 * Both are loaded and merged so a case cannot exist on disk without running.
 *
 * @returns {{aggregated: string[], perTier: string[]}}
 */
export function listFixtureFiles() {
  return {
    aggregated: glob.sync('test/fixtures/*.yml').sort(),
    perTier: glob.sync('test/fixtures/*/*/*.yml').sort(),
  };
}

/**
 * Load all fixture files or filter by language.
 *
 * Merges the aggregated and per-tier layouts into one object per language,
 * deduplicating cases by `id` (per-tier wins, since it is the source of truth).
 *
 * @param {string|null} language - Language code (e.g., 'en', 'ko') or null for all
 * @returns {Array} Array of parsed fixture objects, one per language
 */
export function loadFixtures(language = null) {
  const { aggregated, perTier } = listFixtureFiles();
  const byLanguage = new Map();

  const forLanguage = (lang) => {
    if (!byLanguage.has(lang)) byLanguage.set(lang, { language: lang });
    return byLanguage.get(lang);
  };

  const addCases = (target, fn, tier, cases) => {
    if (!cases || cases.length === 0) return;
    target[fn] = target[fn] || {};
    const existing = target[fn][tier] || [];
    // Later files win on id collision, so drop superseded copies first.
    const incoming = new Set(cases.map(tc => tc.id).filter(Boolean));
    const kept = existing.filter(tc => !tc.id || !incoming.has(tc.id));
    target[fn][tier] = kept.concat(cases);
  };

  // Aggregated layout first, so per-tier files override on id collision.
  for (const file of aggregated) {
    const lang = file.match(/([^/]+)\.yml$/)[1];
    if (language && lang !== language) continue;
    const doc = parse(readFileSync(file, 'utf8')) || {};
    const target = forLanguage(doc.language || lang);
    for (const [fn, tiers] of Object.entries(doc)) {
      if (!tiers || typeof tiers !== 'object' || Array.isArray(tiers)) continue;
      if (fn === 'meta') continue;
      for (const [tier, cases] of Object.entries(tiers)) {
        if (Array.isArray(cases)) addCases(target, fn, tier, cases);
      }
    }
  }

  // Per-tier layout: test/fixtures/<lang>/<fn>/<tier>.yml
  for (const file of perTier) {
    const [, lang, fn, stem] = file.match(/test\/fixtures\/([^/]+)\/([^/]+)\/([^/]+)\.yml$/);
    if (language && lang !== language) continue;
    const doc = parse(readFileSync(file, 'utf8')) || {};
    const cases = (doc.tests || []).map(tc => ({ ...tc, fixture_file: file }));
    addCases(forLanguage(lang), fn, tierKey(stem), cases);
  }

  const fixtures = [...byLanguage.values()];

  if (fixtures.length === 0) {
    console.warn(`No fixtures found${language ? ` for language: ${language}` : ''}`);
  }

  return fixtures;
}

/**
 * Extract test cases for a specific function and tier
 * @param {Array} fixtures - Array of fixture objects from loadFixtures
 * @param {string} fn - Function name: 'lookup', 'generate', 'detect'
 * @param {string} tier - Tier name: 'critical', 'edge_cases', 'invalid', 'known_issues'
 * @returns {Array} Flat array of test cases with language attached
 */
export function getTestCases(fixtures, fn, tier) {
  return fixtures.flatMap(f =>
    (f[fn]?.[tier] || []).map(tc => ({ ...tc, language: f.language }))
  );
}

/**
 * Load prose detection fixtures
 * @param {string|null} language - Language code or null for all
 * @returns {Object|Array} Single fixture object if language specified, array otherwise
 */
export function loadProseFixtures(language = null) {
  const pattern = language
    ? `test/fixtures/detect-prose/${language}.yml`
    : 'test/fixtures/detect-prose/*.yml';

  const files = glob.sync(pattern);

  if (files.length === 0) {
    throw new Error(`No prose fixtures found for pattern: ${pattern}`);
  }

  const fixtures = files.map(file => {
    const content = readFileSync(file, 'utf8');
    return parse(content);
  });

  return language ? fixtures[0] : fixtures;
}

/**
 * Load a prose sample file for snapshot testing
 * @param {string} language - Language code
 * @param {string} filename - Filename within the language folder
 * @returns {string} File contents
 */
export function loadProseSample(language, filename) {
  const path = `test/prose-samples/${language}/${filename}`;
  return readFileSync(path, 'utf8');
}

/**
 * A fixture case is quarantined when it carries a `known_issue` string.
 *
 * Quarantine means the case still loads and is still reported by the runner --
 * as a skip carrying its reason -- rather than being deleted or left to fail.
 * A silently-absent case is what let 703 fixtures rot unnoticed; a skip with a
 * stated reason stays visible.
 *
 * @param {object} tc - Fixture test case
 * @returns {string|null} The reason, or null when the case should run
 */
export function knownIssue(tc) {
  return typeof tc?.known_issue === 'string' && tc.known_issue.trim()
    ? tc.known_issue.trim()
    : null;
}

/**
 * Detector features the fixtures describe but the implementation does not yet
 * support. Cases tagged with any of these are reported as skips carrying the
 * reason, so the gap stays countable instead of being deleted or left red.
 *
 * Shared between the value tests and the invariant sweep -- a case quarantined
 * in one must be quarantined in the other, or the suite contradicts itself.
 */
export const UNIMPLEMENTED_FEATURES = [
  'context-dependent',  // vv. notation requiring prior chapter context
  'chapter-only',       // Full book name with chapter only (no verses)
  'book-only',          // Full book name without chapter or verses (e.g., "Second John")
  'spelled-delimiter',  // "chapter X, verse Y" or "verses X through Y" spelled format
  'verses-prefix',      // "Verses 22-23" referencing previously mentioned chapter
  'vv-prefix',          // "vv. 5-10" verse range notation
  'ch-vv',              // "Ch. 5 ... vv. 16-26" chapter and verse abbreviations
  'comma-delimiter',    // European style "19,16-22" comma as chapter:verse separator
  'chapter-list',       // "Matthew 5, 6, and 7" list of chapters
  'song-of-songs',      // "Song of Songs" alternate name for Song of Solomon
  'canticles',          // "Canticles" alternate name for Song of Solomon
  'gospel-of',          // "Gospel of Matthew" without chapter (book-only context)
  'roman-numeral',      // "I Kings 18", "II Corinthians 12:7-10" archaic numbering
  'spelled-ordinal',    // "First Corinthians 13", "Second Timothy 4:7"
];

/**
 * True when a fixture case is quarantined -- either by an explicit known_issue
 * or by carrying a tag for an unimplemented feature.
 *
 * @param {object} tc - Fixture test case
 * @returns {boolean}
 */
export function isQuarantined(tc) {
  if (knownIssue(tc)) return true;
  return (tc?.tags || []).some(tag => UNIMPLEMENTED_FEATURES.includes(tag));
}
