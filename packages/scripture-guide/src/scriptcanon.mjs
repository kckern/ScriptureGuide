// src/scriptcanon.mjs
// Canon conversion utilities - fully data-driven, zero hardcoded canon keys

// Registry for canon configurations
const canonRegistry = new Map();

// Registry for mappings between canons
const mappingRegistry = new Map();

/**
 * Register a canon's ID format configuration
 * @param {string} canonKey
 * @param {object} config - { pattern: RegExp, format: (n) => string, parse: (s) => number }
 */
export const registerCanon = (canonKey, config) => {
  canonRegistry.set(canonKey, config);
};

/**
 * Register a mapping between two canons
 * @param {string} canonA
 * @param {string} canonB
 * @param {object} mappingData - { aToB: {}, bToA: {} }
 */
export const registerMapping = (canonA, canonB, mappingData) => {
  const key = [canonA, canonB].sort().join(':');
  mappingRegistry.set(key, { canonA, canonB, ...mappingData });
};

/**
 * Get mapping between two canons
 */
const getMapping = (from, to) => {
  const key = [from, to].sort().join(':');
  return mappingRegistry.get(key);
};

/**
 * Detect canon from verse_id format by checking all registered canons
 * @param {string|number} verseId
 * @returns {string|null} canon key or null
 */
export const detectCanon = (verseId) => {
  const idStr = String(verseId);

  for (const [canonKey, config] of canonRegistry.entries()) {
    if (config.pattern && config.pattern.test(idStr)) {
      return canonKey;
    }
  }

  // Fallback: plain integers assumed to be default canon
  if (/^\d+$/.test(idStr)) {
    // Return first canon that accepts plain integers, or null
    for (const [canonKey, config] of canonRegistry.entries()) {
      if (config.acceptsInteger) return canonKey;
    }
  }

  return null;
};

/**
 * Format verse_id for a specific canon
 * @param {number} num
 * @param {string} canonKey
 * @returns {string|number}
 */
export const formatId = (num, canonKey) => {
  const config = canonRegistry.get(canonKey);
  if (config?.format) return config.format(num);
  return num;
};

/**
 * Parse verse_id to number
 * @param {string|number} id
 * @param {string} canonKey
 * @returns {number}
 */
export const parseId = (id, canonKey) => {
  const config = canonRegistry.get(canonKey);
  if (config?.parse) return config.parse(id);
  return typeof id === 'number' ? id : parseInt(id, 10);
};

/**
 * Convert verse_ids between canons
 * @param {(string|number)[]} verseIds
 * @param {{ from?: string, to: string }} options
 * @returns {{ verse_ids: (string|number)[], partial: boolean, error?: string }}
 */
export const convertCanon = (verseIds, options = {}) => {
  const { from: explicitFrom, to: targetCanon } = options;

  if (!targetCanon) {
    return { verse_ids: [], partial: false, error: 'missing_target_canon' };
  }

  if (!verseIds || verseIds.length === 0) {
    return { verse_ids: [], partial: false };
  }

  // Detect source canon if not explicit
  const sourceCanon = explicitFrom || detectCanon(verseIds[0]);

  if (!sourceCanon) {
    return { verse_ids: [], partial: false, error: 'unknown_source_canon' };
  }

  // Same canon - no conversion needed
  if (sourceCanon === targetCanon) {
    return { verse_ids: [...verseIds], partial: false };
  }

  // Get mapping
  const mapping = getMapping(sourceCanon, targetCanon);
  if (!mapping) {
    return { verse_ids: [], partial: false, error: `no_mapping:${sourceCanon}:${targetCanon}` };
  }

  // Determine direction
  const isForward = mapping.canonA === sourceCanon;
  const conversionMap = isForward ? mapping.aToB : mapping.bToA;

  if (!conversionMap) {
    return { verse_ids: [], partial: false, error: `no_conversion_map:${sourceCanon}:${targetCanon}` };
  }

  // Perform conversion
  const result = { verse_ids: [], partial: false };
  const seen = new Set();

  for (const id of verseIds) {
    const numericId = parseId(id, sourceCanon);
    const mappingEntry = conversionMap[numericId];

    if (mappingEntry) {
      const targetIds = mappingEntry.ids || mappingEntry;
      const idsArray = Array.isArray(targetIds) ? targetIds : [targetIds];

      for (const targetId of idsArray) {
        const formatted = formatId(targetId, targetCanon);
        const key = String(formatted);
        if (!seen.has(key)) {
          seen.add(key);
          result.verse_ids.push(formatted);
        }
      }
      if (mappingEntry.partial) result.partial = true;
    } else {
      // Source id has no concordance entry: the input cannot be fully
      // represented in the target canon. Never drop silently.
      result.partial = true;
    }
  }

  return result;
};

/**
 * Get all registered canon keys
 * @returns {string[]}
 */
export const getRegisteredCanons = () => {
  return [...canonRegistry.keys()];
};

/**
 * Check if a canon is registered
 * @param {string} canonKey
 * @returns {boolean}
 */
export const isCanonRegistered = (canonKey) => {
  return canonRegistry.has(canonKey);
};
