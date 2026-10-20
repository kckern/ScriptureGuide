/**
 * Shared utilities for scripture reference matching and processing
 * Contains common logic used across detection modules
 */

/**
 * Check if two ranges overlap
 * @param {Array} range1 - [start, end] tuple
 * @param {Array} range2 - [start, end] tuple
 * @returns {boolean} True if ranges overlap
 */
export const rangesOverlap = (range1, range2) => {
    return range1[0] < range2[1] && range2[0] < range1[1];
};

/**
 * Remove overlapping matches, with configurable preference logic
 * @param {Array} matches - Array of match tuples
 * @param {string} content - Original content (for debugging)
 * @param {Function} preferenceResolver - Function to choose between overlapping matches
 * @returns {Array} Non-overlapping matches
 */
export const removeOverlaps = (matches, content, preferenceResolver = null) => {
    if (matches.length <= 1) return matches;
    
    const result = [];
    
    for (let i = 0; i < matches.length; i++) {
        const current = matches[i];
        let shouldInclude = true;
        
        // Check for overlaps with already included matches
        for (const included of result) {
            if (rangesOverlap(current, included)) {
                shouldInclude = false;
                break;
            }
        }
        
        if (shouldInclude) {
            // Check for overlaps with remaining matches
            for (let j = i + 1; j < matches.length; j++) {
                const next = matches[j];
                if (rangesOverlap(current, next)) {
                    // Use preference resolver or default to longer match
                    if (preferenceResolver) {
                        const preferred = preferenceResolver(current, next, content);
                        if (preferred !== current) {
                            shouldInclude = false;
                            break;
                        }
                    } else {
                        // Default: prefer longer match
                        const currentLength = current[1] - current[0];
                        const nextLength = next[1] - next[0];
                        
                        if (nextLength > currentLength) {
                            shouldInclude = false;
                            break;
                        }
                    }
                }
            }
        }
        
        if (shouldInclude) {
            result.push(current);
        }
    }
    
    return result;
};

/**
 * Calculate gaps between consecutive matches
 * @param {Array} matches - Array of [start, end] tuples
 * @returns {Array} Array of gap [start, end] tuples
 */
export const calculateGaps = (matches) => {
    return matches.reduce((prev, current, index) => {
        if (index === 0) return prev;
        const lastPair = matches[index - 1];
        const gap = [lastPair[1], current[0]];
        return [...prev, gap];
    }, []);
};

/**
 * Calculate negative space (gaps) for final output construction
 * @param {Array} matches - Array of [start, end] tuples
 * @param {number} contentLength - Total length of content
 * @returns {Array} Array of negative space [start, end] tuples
 */
export const calculateNegativeSpace = (matches, contentLength) => {
    const negativeSpace = matches.reduce((prev, current, index, array) => {
        if (index !== 0) {
            const prevIndex = array[index - 1];
            const gap = [prevIndex[1], current[0]];
            prev.push(gap);
        }
        return prev;
    }, []);

    if (matches[0][0] !== 0) {
        negativeSpace.unshift([0, matches[0][0]]);
    }

    if (matches[matches.length - 1][1] !== contentLength) {
        negativeSpace.push([matches[matches.length - 1][1], contentLength]);
    }

    return negativeSpace;
};

/**
 * Merge adjacent matches based on joiner patterns
 * @param {Array} matches - Array of match tuples
 * @param {Array} gapMergeFlags - Boolean array indicating which gaps can be merged
 * @param {Function} compatibilityCheck - Optional function to check if matches can be merged
 * @returns {Array} Merged matches
 */
export const mergeAdjacentMatches = (matches, gapMergeFlags, compatibilityCheck = null) => {
    return matches.reduce((prev, current, index) => {
        if (index === 0) {
            return [current];
        } else {
            const prevIndex = prev[prev.length - 1];
            const shouldMerge = gapMergeFlags[index - 1];
            
            // Check compatibility if function provided
            if (shouldMerge && compatibilityCheck) {
                const isCompatible = compatibilityCheck(prevIndex, current);
                if (!isCompatible) {
                    prev.push(current);
                    return prev;
                }
            }
            
            if (shouldMerge) {
                // Merge logic - keep first position, extend to second end, combine text and verse IDs
                if (prevIndex.length > 2 && current.length > 2) {
                    // Extended format: [start, end, text, verseIds]
                    const startPos = prevIndex[0];
                    const endPos = current[1];
                    const combinedText = prevIndex[2] + "; " + current[2]; // Combine with semicolon + space
                    const combinedVerseIds = [...(prevIndex[3] || []), ...(current[3] || [])]; // Merge verse ID arrays
                    const merged = [startPos, endPos, combinedText, combinedVerseIds];
                    prev[prev.length - 1] = merged;
                } else {
                    // Basic format: [start, end]
                    const merged = [prevIndex[0], current[1], ...(prevIndex.slice(2))];
                    prev[prev.length - 1] = merged;
                }
            } else {
                prev.push(current);
            }
            return prev;
        }
    }, []);
};

/**
 * Decide whether the text between two adjacent matches is purely "joiner"
 * material (separators/conjunctions), meaning the matches should merge into
 * one reference. The gap must consist ENTIRELY of joiner tokens, separator
 * punctuation, and whitespace — a gap that merely CONTAINS a joiner word
 * (e.g. "command" contains "and") must not merge.
 * @param {string} gapString - Text between two matches
 * @param {Array|Object} joiners - Token list, {patterns: [...]}, or legacy anchored regexes
 * @returns {boolean}
 */
export const gapCanMerge = (gapString, joiners) => {
    if (!/\S/.test(gapString)) return true;
    const list = Array.isArray(joiners) ? joiners : (joiners && joiners.patterns) || [];
    let residue = gapString;
    for (const joiner of list) {
        if (typeof joiner !== 'string') continue;
        if (joiner.startsWith('^')) {
            // Legacy full-match regex form
            try { if (new RegExp(joiner, 'i').test(gapString)) return true; } catch (e) { /* skip bad pattern */ }
            continue;
        }
        const escaped = joiner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        residue = residue.replace(new RegExp(escaped, 'ig'), ' ');
    }
    return /^[\s;,&.]*$/.test(residue);
};

/**
 * Build final output by alternating between cut items and negative space
 * @param {Array} cutItems - Processed match content
 * @param {Array} negativeItems - Unprocessed content between matches
 * @param {boolean} firstReferenceIsAtStart - Whether first match starts at position 0
 * @returns {string} Final merged output
 */
export const buildFinalOutput = (cutItems, negativeItems, firstReferenceIsAtStart) => {
    const maxCount = Math.max(cutItems.length, negativeItems.length);
    const merged = [];
    
    for (let i = 0; i < maxCount; i++) {
        const firstItem = firstReferenceIsAtStart ? cutItems[i] : negativeItems[i];
        const secondItem = firstReferenceIsAtStart ? negativeItems[i] : cutItems[i];
        if (firstItem) merged.push(firstItem);
        if (secondItem) merged.push(secondItem);
    }
    
    return merged.join("");
};

/**
 * Default tie-breaker for scriptdetect.mjs overlap resolution
 * @param {Array} pair1 - First match tuple
 * @param {Array} pair2 - Second match tuple  
 * @param {string} content - Original content
 * @returns {Array} Preferred match tuple
 */
export const defaultTieBreaker = (pair1, pair2, content) => {
    const string1 = content.substring(pair1[0], pair1[1]);
    const string2 = content.substring(pair2[0], pair2[1]);

    // If one pair is all lower case, return the other one
    if(/[^A-Z]/.test(string1) && !/[^A-Z]/.test(string2)) return pair2;
    if(/[^A-Z]/.test(string2) && !/[^A-Z]/.test(string1)) return pair1;

    if(string1.length > string2.length) return pair1;
    if(string2.length > string1.length) return pair2;

    return pair1;
};
