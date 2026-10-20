import { loadYaml } from './yaml-loader.mjs';
import { loadCanonStructure } from './canon-loader.mjs';
import { join } from 'path';

const DATA_DIR = 'data';

// Cache for expanded mappings
const mappingCache = new Map();

/**
 * Load raw mapping data from a canon's _mapping.yml
 * @param {string} canonName - Source canon (e.g., 'rlds')
 * @returns {Object|null} Raw mapping data or null
 */
function loadRawMappings(canonName) {
  const path = join(DATA_DIR, 'canons', canonName, '_mapping.yml');
  return loadYaml(path);
}

/**
 * Expand compressed mapping format into lookup maps
 * @param {Object} section - Mapping section with runs/singles/multi
 * @returns {Object} { forward: Map(sourceId -> {ids, partial}), reverse: Map(targetId -> {ids, partial}) }
 */
function expandMappingSection(section) {
  const forward = new Map();  // source -> target(s)
  const reverse = new Map();  // target -> source(s)

  if (!section) return { forward, reverse };

  // Process runs: [source_start, target_start, length]
  for (const run of section.runs || []) {
    const [sourceStart, targetStart, length] = run;
    for (let i = 0; i < length; i++) {
      const sourceId = sourceStart + i;
      const targetId = targetStart + i;

      forward.set(sourceId, { ids: [targetId], partial: false });

      if (!reverse.has(targetId)) {
        reverse.set(targetId, { ids: [], partial: false });
      }
      reverse.get(targetId).ids.push(sourceId);
    }
  }

  // Process singles: [source, target]
  for (const single of section.singles || []) {
    const [sourceId, targetId] = single;

    forward.set(sourceId, { ids: [targetId], partial: false });

    if (!reverse.has(targetId)) {
      reverse.set(targetId, { ids: [], partial: false });
    }
    reverse.get(targetId).ids.push(sourceId);
  }

  // Process multi: [source, [target_ids]]
  for (const multi of section.multi || []) {
    const [sourceId, targetIds] = multi;

    forward.set(sourceId, { ids: targetIds, partial: true });

    for (const targetId of targetIds) {
      if (!reverse.has(targetId)) {
        reverse.set(targetId, { ids: [], partial: false });
      }
      reverse.get(targetId).ids.push(sourceId);
      reverse.get(targetId).partial = true;
    }
  }

  // Mark reverse mappings as partial if multiple sources map to same target
  for (const [targetId, mapping] of reverse) {
    if (mapping.ids.length > 1) {
      mapping.partial = true;
    }
  }

  return { forward, reverse };
}

/**
 * Load and expand mapping data from a canon's _mapping.yml
 * @param {string} canonName - Source canon (e.g., 'rlds')
 * @returns {Object|null} Expanded mappings keyed by target canon
 */
export function loadMappings(canonName) {
  if (mappingCache.has(canonName)) {
    return mappingCache.get(canonName);
  }

  const raw = loadRawMappings(canonName);
  if (!raw) return null;

  const expanded = {};

  // Process each target canon section
  for (const [targetCanon, section] of Object.entries(raw)) {
    // Skip non-mapping keys (like comments that might parse as strings)
    if (typeof section !== 'object' || section === null) continue;
    if (!section.runs && !section.singles && !section.multi) continue;

    expanded[targetCanon] = expandMappingSection(section);
  }

  mappingCache.set(canonName, expanded);
  return expanded;
}

/**
 * Get the mapping between two canons
 * @param {string} fromCanon - Source canon
 * @param {string} toCanon - Target canon
 * @returns {Object|null} { forward, reverse } maps or null
 */
function getMappingBetween(fromCanon, toCanon) {
  // Try direct mapping (fromCanon has mapping to toCanon)
  const fromMappings = loadMappings(fromCanon);
  if (fromMappings && fromMappings[toCanon]) {
    return {
      map: fromMappings[toCanon].forward,
      direction: 'forward'
    };
  }

  // Try reverse mapping (toCanon has mapping from fromCanon)
  const toMappings = loadMappings(toCanon);
  if (toMappings && toMappings[fromCanon]) {
    return {
      map: toMappings[fromCanon].reverse,
      direction: 'reverse'
    };
  }

  return null;
}

/**
 * Map verse ID only (faster, no reference resolution)
 * @param {number} id - Source verse ID
 * @param {string} fromCanon - Source canon
 * @param {string} toCanon - Target canon
 * @returns {Object|null} { ids: [number], partial: boolean }
 */
export function mapVerseId(id, fromCanon, toCanon) {
  const mapping = getMappingBetween(fromCanon, toCanon);
  if (!mapping) return null;

  const result = mapping.map.get(id);
  if (!result) return null;

  return {
    ids: [...result.ids],
    partial: result.partial
  };
}

/**
 * Convert verse ID to human-readable reference
 * @param {number} id - Verse ID
 * @param {string} canonName - Canon name
 * @returns {string|null} Reference string or null
 */
function idToReference(id, canonName) {
  const canon = loadCanonStructure(canonName);
  if (!canon) return null;

  // Handle inherited canons - need to check parent too
  let books = canon.books || [];
  if (canon.extends) {
    const parent = loadCanonStructure(canon.extends);
    if (parent) {
      books = [...parent.books, ...books];
    }
  }

  for (const book of books) {
    const bookStart = book.first_verse_id;
    const totalVerses = book.verses.reduce((a, b) => a + b, 0);
    const bookEnd = bookStart + totalVerses - 1;

    if (id >= bookStart && id <= bookEnd) {
      // Find chapter and verse within book
      let remaining = id - bookStart;
      for (let chap = 0; chap < book.verses.length; chap++) {
        if (remaining < book.verses[chap]) {
          const chapter = chap + 1;
          const verse = remaining + 1;
          // Convert book key to display name (basic conversion)
          const bookName = book.key
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
          return `${bookName} ${chapter}:${verse}`;
        }
        remaining -= book.verses[chap];
      }
    }
  }

  return null;
}

/**
 * Parse reference string to verse ID
 * @param {string} ref - Reference string (e.g., "1 Nephi 1:50")
 * @param {string} canonName - Canon name
 * @returns {number|null} Verse ID or null
 */
function referenceToId(ref, canonName) {
  const canon = loadCanonStructure(canonName);
  if (!canon) return null;

  // Handle inherited canons
  let books = canon.books || [];
  if (canon.extends) {
    const parent = loadCanonStructure(canon.extends);
    if (parent) {
      books = [...parent.books, ...books];
    }
  }

  // Parse reference: "Book Name Chapter:Verse"
  const match = ref.match(/^(.+?)\s+(\d+):(\d+)$/);
  if (!match) return null;

  const [, bookPart, chapterStr, verseStr] = match;
  const chapter = parseInt(chapterStr, 10);
  const verse = parseInt(verseStr, 10);

  // Normalize book name for matching
  const normalizedInput = bookPart.toLowerCase().replace(/\s+/g, '_');

  // Find matching book
  for (const book of books) {
    const normalizedKey = book.key.toLowerCase();

    // Try exact match or prefix match
    if (normalizedKey === normalizedInput ||
        normalizedKey.startsWith(normalizedInput) ||
        normalizedInput.startsWith(normalizedKey.split('_')[0])) {

      if (chapter < 1 || chapter > book.verses.length) return null;
      if (verse < 1 || verse > book.verses[chapter - 1]) return null;

      // Calculate verse ID
      let id = book.first_verse_id;
      for (let c = 0; c < chapter - 1; c++) {
        id += book.verses[c];
      }
      id += verse - 1;
      return id;
    }
  }

  return null;
}

/**
 * Map a verse between canons
 * @param {number|string} input - Verse ID or reference string
 * @param {string} fromCanon - Source canon
 * @param {string} toCanon - Target canon
 * @returns {Object|null} { ids: [number], refs: [string], partial: boolean }
 */
export function mapVerse(input, fromCanon, toCanon) {
  let sourceId;
  const inputIsReference = typeof input === 'string';

  if (inputIsReference) {
    sourceId = referenceToId(input, fromCanon);
    if (sourceId === null) return null;
  } else {
    sourceId = input;
  }

  const result = mapVerseId(sourceId, fromCanon, toCanon);
  if (!result) return null;

  // Add reference strings if input was a reference
  if (inputIsReference) {
    result.refs = result.ids.map(id => idToReference(id, toCanon)).filter(Boolean);
  }

  return result;
}

/**
 * Clear mapping cache (for testing)
 */
export function clearMappingCache() {
  mappingCache.clear();
}
