import { loadYaml } from './yaml-loader.mjs';
import { deepMerge } from './deep-merge.mjs';
import { join } from 'path';

const DATA_DIR = 'data';

// Cache for loaded canons
const canonCache = new Map();

/**
 * Load shared language patterns
 * @param {string} langCode - Language code (e.g., 'en')
 * @returns {Object|null} Shared language config or null
 */
export function loadSharedLanguage(langCode) {
  const path = join(DATA_DIR, 'shared', `${langCode}.yml`);
  return loadYaml(path);
}

/**
 * Load canon structure (books, chapters, verse IDs)
 * @param {string} canonName - Canon name (e.g., 'bible', 'lds')
 * @returns {Object|null} Canon structure or null
 */
export function loadCanonStructure(canonName) {
  const path = join(DATA_DIR, 'canons', canonName, `_${canonName}.yml`);
  return loadYaml(path);
}

/**
 * Load canon with inheritance resolution
 * @param {string} canonName - Canon name
 * @returns {Object|null} Merged canon structure
 */
export function loadCanonWithInheritance(canonName) {
  if (canonCache.has(canonName)) {
    return canonCache.get(canonName);
  }

  const structure = loadCanonStructure(canonName);
  if (!structure) return null;

  let merged = { ...structure };

  // If extends parent, load and merge parent first
  if (structure.extends) {
    const parent = loadCanonWithInheritance(structure.extends);
    if (parent) {
      merged = {
        ...structure,
        books: [...parent.books, ...structure.books],
        _parent: structure.extends
      };
    }
  }

  canonCache.set(canonName, merged);
  return merged;
}

/**
 * Clear canon cache (for testing)
 */
export function clearCanonCache() {
  canonCache.clear();
}

/**
 * Load canon-specific language file
 * @param {string} canonName - Canon name
 * @param {string} langCode - Language code
 * @returns {Object|null} Canon language config or null
 */
export function loadCanonLanguage(canonName, langCode) {
  const path = join(DATA_DIR, 'canons', canonName, `${langCode}.yml`);
  return loadYaml(path);
}

/**
 * Load full language config (shared + canon + parent canon)
 * @param {string} canonName - Canon name
 * @param {string} langCode - Language code
 * @returns {Object|null} Merged language config
 */
export function loadFullLanguage(canonName, langCode) {
  const shared = loadSharedLanguage(langCode);
  if (!shared) return null;

  const structure = loadCanonStructure(canonName);
  if (!structure) return null;

  // Load parent's language if extends
  let parentLang = {};
  if (structure.extends) {
    parentLang = loadCanonLanguage(structure.extends, langCode) || {};
  }

  const canonLang = loadCanonLanguage(canonName, langCode) || {};

  // Merge: shared → parent → canon (for books, merge rather than replace)
  const result = deepMerge(shared, parentLang, canonLang);

  // Special handling for books - merge all book objects
  result.books = deepMerge(parentLang.books || {}, canonLang.books || {});

  return result;
}
