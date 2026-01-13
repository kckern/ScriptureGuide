/**
 * Data Loader - Loads compiled scripture data from JS modules
 *
 * This module provides functions to load pre-compiled scripture data
 * including canon structures, language data, and COC mapping.
 */

import { deepMerge } from './deep-merge.mjs';

// Static imports for structure files
import bibleStructure from '../data/canons/bible/structure.mjs';
import ldsStructure from '../data/canons/lds/structure.mjs';
import cocStructure from '../data/canons/coc/structure.mjs';

// Static imports for shared language files
import sharedEn from '../data/shared/en.mjs';
import sharedKo from '../data/shared/ko.mjs';

// Static imports for canon language files
import bibleEn from '../data/canons/bible/en.mjs';
import ldsEn from '../data/canons/lds/en.mjs';
import cocEn from '../data/canons/coc/en.mjs';

// Maps for lookups
const structureMap = {
  bible: bibleStructure,
  lds: ldsStructure,
  coc: cocStructure
};

const sharedLanguageMap = {
  en: sharedEn,
  ko: sharedKo
};

const canonLanguageMap = {
  bible: { en: bibleEn },
  lds: { en: ldsEn },
  coc: { en: cocEn }
};

// Caches
const structureCache = new Map();
const languageCache = new Map();
let cocMappingCache = null;

/**
 * Get canon structure with parent inheritance resolved
 * @param {string} canon - Canon name ('bible', 'lds', 'coc')
 * @returns {Object|null} Merged structure or null if canon not found
 */
export function getCanonStructure(canon) {
  // Check cache first
  if (structureCache.has(canon)) {
    return structureCache.get(canon);
  }

  const structure = structureMap[canon];
  if (!structure) {
    return null;
  }

  let merged;

  // If extends parent, merge parent books first
  if (structure.extends) {
    const parent = getCanonStructure(structure.extends);
    if (parent) {
      merged = {
        ...structure,
        books: [...parent.books, ...structure.books],
        _parent: structure.extends
      };
    } else {
      merged = { ...structure };
    }
  } else {
    merged = { ...structure };
  }

  // Cache the result
  structureCache.set(canon, merged);
  return merged;
}

/**
 * Get language data with shared + parent + canon data merged
 * @param {string} canon - Canon name ('bible', 'lds', 'coc')
 * @param {string} lang - Language code ('en', 'ko')
 * @returns {Object|null} Merged language data or null if not found
 */
export function getLanguageData(canon, lang) {
  const cacheKey = `${canon}:${lang}`;

  // Check cache first
  if (languageCache.has(cacheKey)) {
    return languageCache.get(cacheKey);
  }

  // Get shared language data
  const shared = sharedLanguageMap[lang];
  if (!shared) {
    return null;
  }

  // Get structure to check for extends
  const structure = structureMap[canon];
  if (!structure) {
    return null;
  }

  // Get canon language map
  const canonLangs = canonLanguageMap[canon];
  if (!canonLangs) {
    return null;
  }

  // Get canon-specific language data
  const canonLang = canonLangs[lang];
  if (!canonLang) {
    return null;
  }

  // Load parent's language if extends
  let parentLang = {};
  if (structure.extends) {
    const parentCanonLangs = canonLanguageMap[structure.extends];
    if (parentCanonLangs && parentCanonLangs[lang]) {
      parentLang = parentCanonLangs[lang];
    }
  }

  // Merge: shared -> parent -> canon
  const result = deepMerge(shared, parentLang, canonLang);

  // Special handling for books - merge all book objects
  result.books = deepMerge(parentLang.books || {}, canonLang.books || {});

  // Special handling for pre_rules - concatenate arrays
  const sharedPreRules = shared.pre_rules || [];
  const canonPreRules = canonLang.pre_rules || [];
  result.pre_rules = [...sharedPreRules, ...canonPreRules];

  // Cache the result
  languageCache.set(cacheKey, result);
  return result;
}

/**
 * Get COC mapping data (lazy loaded due to size)
 * @returns {Promise<Object>} COC mapping data
 */
export async function getCocMapping() {
  if (cocMappingCache) {
    return cocMappingCache;
  }

  // Dynamic import for lazy loading
  const module = await import('../data/canons/coc/mapping.mjs');
  cocMappingCache = module.default;
  return cocMappingCache;
}

/**
 * Clear all data caches (for testing)
 */
export function clearDataCache() {
  structureCache.clear();
  languageCache.clear();
  cocMappingCache = null;
}
