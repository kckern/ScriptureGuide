// src/lib/options-resolver.mjs

// Known languages (expandable via YAML discovery)
const KNOWN_LANGUAGES = new Set(['en', 'ko', 'de', 'es', 'fr', 'pt', 'ru', 'ja', 'zh', 'swe']);

// Known canons (expandable via YAML discovery)
const KNOWN_CANONS = new Set([
  'bible', 'lds', 'apocrypha', 'coc',
  'koran', 'gita', 'dhammapada', 'taoteching', 'vedas',
  'constitution', 'shakespeare'
]);

// Default settings
let defaults = {
  language: 'en',
  canon: 'lds',
  fuzzyCanon: true
};

/**
 * Set global defaults
 * @param {Object} newDefaults
 */
export function setDefaults(newDefaults) {
  defaults = { ...defaults, ...newDefaults };
}

/**
 * Get current defaults
 * @returns {Object}
 */
export function getDefaults() {
  return { ...defaults };
}

/**
 * Check if string is a known language code
 * @param {string} str
 * @returns {boolean}
 */
export function isKnownLanguage(str) {
  return KNOWN_LANGUAGES.has(str?.toLowerCase());
}

/**
 * Check if string is a known canon
 * @param {string} str
 * @returns {boolean}
 */
export function isKnownCanon(str) {
  return KNOWN_CANONS.has(str?.toLowerCase());
}

/**
 * Resolve options from various input formats
 * @param {undefined|string|Object} input
 * @returns {Object} Resolved options
 */
export function resolveOptions(input) {
  if (input === undefined || input === null) {
    return { ...defaults };
  }

  if (typeof input === 'string') {
    const lower = input.toLowerCase();

    // Check language first
    if (isKnownLanguage(lower)) {
      return { ...defaults, language: lower };
    }

    // Then check canon
    if (isKnownCanon(lower)) {
      return { ...defaults, canon: lower };
    }

    throw new Error(`Unknown language or canon: ${input}`);
  }

  if (typeof input === 'object') {
    return { ...defaults, ...input };
  }

  throw new Error(`Invalid options type: ${typeof input}`);
}
