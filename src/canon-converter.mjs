// src/canon-converter.mjs
import { getCocMapping } from './lib/data-loader.mjs';

/**
 * Detect canon from verse_id format
 * @param {string|number} verseId
 * @returns {'coc'|'lds'|null}
 */
export const detectCanon = (verseId) => {
  if (typeof verseId === 'string' && /^C\d+$/.test(verseId)) return 'coc';
  if (typeof verseId === 'number') return 'lds';
  if (typeof verseId === 'string' && /^\d+$/.test(verseId)) return 'lds';
  return null;
};

/**
 * Format COC verse_id: 50 -> "C00050"
 * @param {number} num
 * @returns {string}
 */
export const formatCocId = (num) => `C${String(num).padStart(5, '0')}`;

/**
 * Parse COC verse_id: "C00050" -> 50
 * @param {string} id
 * @returns {number}
 */
export const parseCocId = (id) => parseInt(id.slice(1), 10);

/**
 * Convert verse_ids between canons
 * @param {(string|number)[]} verseIds - Array of verse IDs
 * @param {{ from?: 'lds'|'coc', to?: 'lds'|'coc' }} options - Conversion options
 * @returns {Promise<{ verse_ids: (string|number)[], partial: boolean }>}
 */
export async function convertCanon(verseIds, { from, to } = {}) {
  // Auto-detect source canon if not provided
  if (!from && verseIds.length > 0) {
    from = detectCanon(verseIds[0]);
  }

  // If same canon or no valid source/target, return IDs as-is
  if (from === to || !from || !to) {
    return { verse_ids: verseIds, partial: false };
  }

  const mapping = await getCocMapping();
  const result = { verse_ids: [], partial: false };

  if (from === 'coc' && to === 'lds') {
    for (const id of verseIds) {
      const num = typeof id === 'string' ? parseCocId(id) : id;
      const mapped = mapping.cocToLds[num];
      if (mapped) {
        result.verse_ids.push(...mapped.lds);
        if (mapped.partial) result.partial = true;
      }
    }
  } else if (from === 'lds' && to === 'coc') {
    const seen = new Set();
    for (const id of verseIds) {
      const mapped = mapping.ldsToCoc[id];
      if (mapped) {
        for (const cocNum of mapped.coc) {
          if (!seen.has(cocNum)) {
            seen.add(cocNum);
            result.verse_ids.push(formatCocId(cocNum));
          }
        }
        if (mapped.partial) result.partial = true;
      }
    }
  }

  return result;
}

/**
 * Convert COC verse_ids to LDS verse_ids (backward compatibility)
 * @param {string[]} cocIds - Array of COC ids like ['C00001', 'C00002']
 * @returns {Promise<{ verse_ids: number[], partial: boolean }>}
 */
export const convertToLds = async (cocIds) => convertCanon(cocIds, { from: 'coc', to: 'lds' });

/**
 * Convert LDS verse_ids to COC verse_ids (backward compatibility)
 * @param {number[]} ldsIds - Array of LDS verse_ids
 * @returns {Promise<{ verse_ids: string[], partial: boolean }>}
 */
export const convertToCoc = async (ldsIds) => convertCanon(ldsIds, { from: 'lds', to: 'coc' });
