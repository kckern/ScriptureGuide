import { getCanonStructure, getLanguageData } from './lib/data-loader.mjs';
import { processReferenceDetection } from './scriptdetect.mjs';
import {  detectReferencesWithContext } from './scriptdetectcontext.mjs';
import { detectCanon, formatCocId, parseCocId, convertToLds, convertToCoc, convertCanon, convertToLdsSync, convertToCocSync } from './canon-converter.mjs';
import {
  MAX_RANGE_SIZE,
  MAX_CHAPTER,
  MAX_VERSE,
  MAX_QUERY_LENGTH,
  CANON_LDS,
  CANON_COC,
  DEFAULTS
} from './config.mjs';

// Module-level caches for performance
const indexCache = {
  refIndex: null,
  verseIdIndex: null,
  configHash: null
};

const cocIndexCache = {
  refIndex: null,
  verseIdIndex: null
};

const hashConfig = (config) => {
  // Hash based on language for proper cache invalidation
  return config?.language || 'en';
};

// Browser localStorage key for language preference
const LANGUAGE_STORAGE_KEY = 'scriptureGuideUtils_language';

// Helper function to safely access localStorage
const getStoredLanguage = () => {
    try {
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem(LANGUAGE_STORAGE_KEY);
        }
    } catch (e) {
        // localStorage might not be available in some environments
    }
    return null;
};

const setStoredLanguage = (language) => {
    try {
        if (typeof localStorage !== 'undefined') {
            if (language) {
                localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
            } else {
                localStorage.removeItem(LANGUAGE_STORAGE_KEY);
            }
        }
    } catch (e) {
        // localStorage might not be available in some environments
    }
};

// Global default language (can be overridden by localStorage)
let defaultLanguage = null;

const setLanguage = function(language) {
    defaultLanguage = language;
    setStoredLanguage(language);
};

const getEffectiveLanguage = function(explicitLanguage) {
    // Priority: explicit parameter > stored language > default language > 'en'
    return explicitLanguage || getStoredLanguage() || defaultLanguage || 'en';
};

// Canon state management
let defaultCanon = 'lds';

const setCanon = (canon) => {
    defaultCanon = canon;
};

const getCanon = () => defaultCanon;

const getEffectiveCanon = (explicitCanon) => {
    return explicitCanon || defaultCanon || 'lds';
};

// Helper function to convert new structure format to legacy format
// New format: { books: [{ key, verses: [...] }] }
// Legacy format: { bookName: [verseCount1, verseCount2, ...] }
const buildLegacyIndex = (canon, langData) => {
    const structure = getCanonStructure(canon);
    if (!structure || !structure.books) return {};

    const index = {};
    for (const book of structure.books) {
        // Use the display name from langData, or fall back to the key
        const displayName = langData?.books?.[book.key]?.name || book.key;
        index[displayName] = book.verses;
    }
    return index;
};

// Helper function to build books regex array from language data
// New format: { books: { key: { name, pattern, alt } } }
// Legacy format: [ [pattern, name], [alt1, name], ... ]
const buildBooksRegex = (langData) => {
    if (!langData || !langData.books) return [];

    const booksRegex = [];
    for (const [key, bookData] of Object.entries(langData.books)) {
        const name = bookData.name || key;

        // Check if this is a numbered book (key starts with digit_)
        const numberedMatch = key.match(/^(\d+)_/);
        const bookNumber = numberedMatch ? numberedMatch[1] : null;

        // Add the pattern match
        if (bookData.pattern) {
            // For numbered books, prepend the number to the pattern
            const pattern = bookNumber ? `${bookNumber}\\s*${bookData.pattern}` : bookData.pattern;
            booksRegex.push([pattern, name]);
        }
        // Add alternative names
        if (bookData.alt && Array.isArray(bookData.alt)) {
            for (const alt of bookData.alt) {
                booksRegex.push([alt, name]);
            }
        }
    }
    return booksRegex;
};

// Helper to get COC structure data (for dual-canon lookup)
const getCocData = () => {
    const cocStructure = getCanonStructure('coc');
    if (!cocStructure || !cocStructure.books) {
        return { books: {} };
    }

    // Convert to legacy cocData format: { books: { bookName: [verseCount1, ...] } }
    const cocLangData = getLanguageData('coc', 'en');
    const books = {};
    for (const book of cocStructure.books) {
        const displayName = cocLangData?.books?.[book.key]?.name || book.key;
        books[displayName] = book.verses;
    }
    return { books };
};

const lookupReference = function(query, language = null, lookupConfig = {}) {
    // Input validation
    const isValidQuery = query && typeof query === 'string' && query.trim().length > 0;
    if (!isValidQuery) {
        return {
            query: query ?? '',
            ref: '',
            verse_ids: [],
            error: 'Invalid input: query must be a non-empty string'
        };
    }

    // Length limit to prevent DoS
    if (query.length > MAX_QUERY_LENGTH) {
        return {
            query: query.substring(0, 100) + '...',
            ref: '',
            verse_ids: [],
            error: `Invalid input: query exceeds maximum length (${MAX_QUERY_LENGTH} chars)`
        };
    }

    // Get effective language (explicit > stored > default > 'en')
    const effectiveLanguage = getEffectiveLanguage(language);

    // Extract canon options
    const { canon, convertTo, includeParallel } = lookupConfig;

    // Determine if using COC canon
    const useCoc = canon === CANON_COC;

    // Try lookup in the requested language first
    let lookupResult;
    let verse_ids;
    let errors;
    if (useCoc) {
        verse_ids = lookupInLanguageCoc(query, effectiveLanguage);
    } else {
        lookupResult = lookupInLanguage(query, effectiveLanguage);
        verse_ids = lookupResult.verse_ids;
        errors = lookupResult.errors;
    }

    if (verse_ids?.length) {
        let result = {
            "query": query,
            "ref": useCoc ? generateReferenceCoc(verse_ids, effectiveLanguage) : generateReference(verse_ids, effectiveLanguage),
            "verse_ids": verse_ids
        };

        // Handle convertTo option
        if (convertTo && convertTo !== canon) {
            result.sourceCanon = useCoc ? CANON_COC : CANON_LDS;
            const converted = useCoc ? convertToLdsSync(verse_ids) : convertToCocSync(verse_ids);
            result.verse_ids = converted.verse_ids;
            result.partial = converted.partial;
            result.ref = convertTo === CANON_COC
                ? generateReferenceCoc(converted.verse_ids, effectiveLanguage)
                : generateReference(converted.verse_ids, effectiveLanguage);
        }

        // Handle includeParallel option
        if (includeParallel) {
            const parallelCanon = useCoc ? CANON_LDS : CANON_COC;
            const parallelConverted = useCoc ? convertToLdsSync(verse_ids) : convertToCocSync(verse_ids);
            result.parallel = {
                canon: parallelCanon,
                verse_ids: parallelConverted.verse_ids,
                ref: parallelCanon === CANON_COC
                    ? generateReferenceCoc(parallelConverted.verse_ids, effectiveLanguage)
                    : generateReference(parallelConverted.verse_ids, effectiveLanguage),
                partial: parallelConverted.partial
            };
        }

        return result;
    }

    // If no results and multi-language lookup is allowed, try fallback languages
    if (!lookupConfig.noMulti) {
        const fallbackResult = lookupWithLanguageFallback(query, effectiveLanguage);
        // If fallback also found no results and we have errors, include them
        if (fallbackResult.verse_ids.length === 0 && errors) {
            fallbackResult.error = errors.join('; ');
        }
        return fallbackResult;
    }

    return {
        "query": query,
        "ref": "",
        "verse_ids": [],
        error: errors ? errors.join('; ') : undefined
    };
}

const lookupInLanguage = function(query, language) {
    const config = getLanguageConfig(language);

    // Cleanup and process the reference
    let ref = cleanReference(query, config);
    let refs = splitReferences(ref, config);

    // Lookup each single reference individually, return the set
    let verse_ids = [];
    let errors = [];
    for (let i in refs) {
        const result = lookupSingleRef(refs[i], config);
        if (result && result.error) {
            errors.push(result.error);
        } else if (Array.isArray(result)) {
            verse_ids = verse_ids.concat(result);
        } else if (result && result.verse_ids) {
            verse_ids = verse_ids.concat(result.verse_ids);
        }
    }

    return {
        verse_ids,
        errors: errors.length > 0 ? errors : undefined
    };
}

const lookupInLanguageCoc = function(query, language) {
    const config = getLanguageConfig(language);

    // Cleanup and process the reference
    let ref = cleanReference(query, config);
    let refs = splitReferences(ref, config);

    // Lookup each single reference individually, return the set of COC verse_ids
    let verse_ids = [];
    for (let i in refs) {
        verse_ids = verse_ids.concat(lookupSingleRefCoc(refs[i], config));
    }

    return verse_ids;
}

const lookupSingleRefCoc = function(ref, config) {
    const booksWithDashRegex = /^(joseph|조셉)/i;
    if (!booksWithDashRegex.test(ref) && ref.match(/[—-](\d\s)*[\D]/ig)) return []; // Multi-book ranges not supported for COC yet
    let book = getBook(ref, config);
    if (!book) return [];
    const cocData = getCocData();
    if (!cocData.books[book]) return []; // Book not in COC
    let ranges = getRanges(ref, book);
    let verse_ids = loadVerseIdsCoc(book, ranges);
    return verse_ids;
}

const loadVerseIdsCoc = function(book, ranges) {
    let verseList = [];
    const cocRefIndex = loadCocRefIndex();

    for (let i in ranges) {
        // Bounds check: stop if we've collected enough
        if (verseList.length >= MAX_RANGE_SIZE) break;

        let range = ranges[i];
        let matches = range.match(/(\d+): *([\dX]+)-*([\dX]*)/);
        if (!matches) continue;

        let chapter = parseInt(matches[1]);
        let start = parseInt(matches[2]);
        let end = matches[3];

        // Validate chapter bounds
        if (chapter < 1 || chapter > MAX_CHAPTER) continue;

        if (end === '') end = start;
        if (end === 'X') end = loadMaxVerseCoc(book, chapter);
        else end = parseInt(end);

        // Validate verse bounds
        start = Math.max(1, Math.min(start, MAX_VERSE));
        end = Math.max(start, Math.min(end, MAX_VERSE));

        for (let verse_num = start; verse_num <= end; verse_num++) {
            if (verseList.length >= MAX_RANGE_SIZE) break;
            if (cocRefIndex[book]?.[chapter]?.[verse_num]) {
                verseList.push(cocRefIndex[book][chapter][verse_num]);
            }
        }
    }
    return verseList;
}

const loadCocRefIndex = function() {
    // Return cached if available
    if (cocIndexCache.refIndex) {
        return cocIndexCache.refIndex;
    }

    const cocData = getCocData();
    let refIndex = {};
    let verse_num_global = 1;
    const book_list = Object.keys(cocData.books);
    for (let book of book_list) {
        refIndex[book] = {};
        const chapters = cocData.books[book];
        for (let chapter_idx = 0; chapter_idx < chapters.length; chapter_idx++) {
            let chapter_num = chapter_idx + 1;
            let verse_max = chapters[chapter_idx];
            refIndex[book][chapter_num] = {};
            for (var verse_num = 1; verse_num <= verse_max; verse_num++) {
                refIndex[book][chapter_num][verse_num] = formatCocId(verse_num_global);
                verse_num_global++;
            }
        }
    }

    // Cache the result
    cocIndexCache.refIndex = refIndex;

    return refIndex;
}

const loadCocVerseIdIndex = function() {
    // Return cached if available
    if (cocIndexCache.verseIdIndex) {
        return cocIndexCache.verseIdIndex;
    }

    const cocData = getCocData();
    let verseIdIndex = {};
    let verse_num_global = 1;
    const book_list = Object.keys(cocData.books);
    for (let book of book_list) {
        const chapters = cocData.books[book];
        for (let chapter_idx = 0; chapter_idx < chapters.length; chapter_idx++) {
            let chapter_num = chapter_idx + 1;
            let verse_max = chapters[chapter_idx];
            for (var verse_num = 1; verse_num <= verse_max; verse_num++) {
                const cocId = formatCocId(verse_num_global);
                verseIdIndex[cocId] = [book, chapter_num, verse_num];
                verse_num_global++;
            }
        }
    }

    // Cache the result
    cocIndexCache.verseIdIndex = verseIdIndex;

    return verseIdIndex;
}

const loadMaxChapterCoc = function(book) {
    const cocData = getCocData();
    if (!cocData.books[book]) return 0;
    return cocData.books[book].length;
}

const loadMaxVerseCoc = function(book, chapter) {
    const cocData = getCocData();
    if (!cocData.books[book]) return 0;
    return cocData.books[book][parseInt(chapter) - 1] || 0;
}

/**
 * Load reference index for specified canon
 * @param {string} canon - 'lds' or 'coc'
 * @param {Object} config - Configuration object (required for LDS)
 * @returns {Object} Reference index: refIndex[book][chapter][verse] = id
 */
const loadRefIndexByCanon = function(canon, config = null) {
    if (canon === CANON_COC) {
        return loadCocRefIndex();
    }
    if (!config) {
        throw new Error('Config required for LDS canon');
    }
    return loadRefIndex(config);
};

/**
 * Load verse ID index for specified canon
 * @param {string} canon - 'lds' or 'coc'
 * @param {Object} config - Configuration object (required for LDS)
 * @returns {Object|Array} Verse ID to [book, chapter, verse] mapping
 */
const loadVerseIdIndexByCanon = function(canon, config = null) {
    if (canon === CANON_COC) {
        return loadCocVerseIdIndex();
    }
    if (!config) {
        throw new Error('Config required for LDS canon');
    }
    return loadVerseIdIndex(config);
};

/**
 * Get max verse for book/chapter in specified canon
 * @param {string} book - Book name
 * @param {number} chapter - Chapter number
 * @param {string} canon - 'lds' or 'coc'
 * @param {Object} config - Configuration (required for LDS)
 * @returns {number} Maximum verse number
 */
const loadMaxVerseByCanon = function(book, chapter, canon, config = null) {
    if (canon === CANON_COC) {
        return loadMaxVerseCoc(book, chapter);
    }
    if (!config) {
        throw new Error('Config required for LDS canon');
    }
    return loadMaxVerse(book, chapter, config);
};

const generateReferenceCoc = function(verse_ids, language = null) {
    if (!verse_ids || verse_ids.length === 0) return '';

    // Convert all IDs to COC format if not already
    verse_ids = verse_ids.map(id => {
        if (typeof id === 'string' && id.startsWith('C')) return id;
        return formatCocId(id);
    });

    const effectiveLanguage = getEffectiveLanguage(language);
    const config = getLanguageConfig(effectiveLanguage);
    let ranges = loadVerseStructureCoc(verse_ids);
    let refs = loadRefsFromRangesCoc(ranges, config);

    let ref = refs.join("; ");
    return ref;
}

const loadVerseStructureCoc = function(verse_ids) {
    let verseIdIndex = loadCocVerseIdIndex();
    let segments = consecutiveSplitterCoc(verse_ids);
    let structure = [];
    for (let i in segments) {
        let min = segments[i][0];
        let max = segments[i][segments[i].length - 1];
        // Check if values exist before pushing to structure (handles out-of-range COC IDs)
        if (verseIdIndex[min] && verseIdIndex[max]) {
            structure.push([verseIdIndex[min], verseIdIndex[max]]);
        }
    }
    return structure;
}

const consecutiveSplitterCoc = function(verse_ids) {
    let segments = [];
    let segment = [];
    let previousNum = 0;
    for (let i in verse_ids) {
        const currentNum = parseCocId(verse_ids[i]);
        if (currentNum !== previousNum + 1 && previousNum !== 0) {
            segments.push(segment);
            segment = [];
        }
        segment.push(verse_ids[i]);
        previousNum = currentNum;
    }
    segments.push(segment);
    return segments;
}

const loadRefsFromRangesCoc = function(ranges, config) {
    let refs = [];
    let mostRecentBook, mostRecentChapter;
    for (let i in ranges) {
        // Skip invalid ranges (defense-in-depth for out-of-range COC IDs)
        if (!ranges[i] || !ranges[i][0] || !ranges[i][1]) continue;
        let ref = '';
        let start_bk = ranges[i][0][0];
        let end_bk = ranges[i][1][0];
        let start_ch = ranges[i][0][1];
        let end_ch = ranges[i][1][1];
        let start_vs = ranges[i][0][2];
        let end_vs = ranges[i][1][2];
        if (start_bk === end_bk) {
            if (start_ch === end_ch) {
                if (start_bk === mostRecentBook) start_bk = '';
                if (start_bk === mostRecentBook && start_ch === mostRecentChapter) start_ch = '';
                if (start_vs === end_vs) {
                    ref = start_bk + " " + start_ch + ":" + start_vs;
                } else {
                    if (start_vs === 1 && end_vs === loadMaxVerseCoc(start_bk, start_ch)) {
                        ref = start_bk + " " + start_ch;
                    } else {
                        ref = start_bk + " " + start_ch + ":" + start_vs + "-" + end_vs;
                    }
                }
            } else {
                if (start_vs === 1 && end_vs === loadMaxVerseCoc(end_bk, end_ch)) {
                    ref = start_bk + " " + start_ch + "-" + end_ch;
                } else {
                    ref = start_bk + " " + start_ch + ":" + start_vs + "-" + end_ch + ":" + end_vs;
                }
            }
        } else {
            if (start_vs === 1 && end_vs === loadMaxVerseCoc(end_bk, end_ch)) {
                ref = start_bk + " " + start_ch + " - " + end_bk + " " + end_ch;
            } else if (end_vs === loadMaxVerseCoc(end_bk, end_ch)) {
                ref = start_bk + " " + start_ch + ":" + start_vs + " - " + end_bk + " " + end_ch;
            } else if (start_vs === 1) {
                ref = start_bk + " " + start_ch + " - " + end_bk + " " + end_ch + ":" + end_vs;
            } else {
                ref = start_bk + " " + start_ch + ":" + start_vs + " - " + end_bk + " " + end_ch + ":" + end_vs;
            }
        }
        if (start_bk !== '') mostRecentBook = start_bk;
        if (start_ch !== '') mostRecentChapter = start_ch;
        ref = ref.replace(/^\s+:*/, '').trim();

        // Apply language-specific post rules
        if (config.raw_regex.post_rules) {
            for (let rule of config.raw_regex.post_rules) {
                const re = new RegExp(rule[0], "ig");
                ref = ref.replace(re, rule[1]);
            }
        }

        refs.push(ref);
    }
    return refs;
}

// List of supported languages (could be extended in data-loader later)
const SUPPORTED_LANGUAGES = ['en', 'ko'];

const lookupWithLanguageFallback = function(query, targetLanguage) {
    // Define fallback order: English first (if not already tried), then all other languages
    const fallbackLanguages = targetLanguage !== 'en'
        ? ['en', ...SUPPORTED_LANGUAGES.filter(lang => lang !== 'en' && lang !== targetLanguage)]
        : SUPPORTED_LANGUAGES.filter(lang => lang !== targetLanguage);

    for (const lang of fallbackLanguages) {
        const lookupResult = lookupInLanguage(query, lang);
        const verse_ids = lookupResult.verse_ids;
        if (verse_ids?.length) {
            // Generate reference in the target language
            const refInTargetLanguage = generateReference(verse_ids, targetLanguage);
            return {
                "query": query,
                "ref": refInTargetLanguage,
                "verse_ids": verse_ids
            };
        }
    }

    return {
        "query": query,
        "ref": "",
        "verse_ids": []
    };
}


const lookupSingleRef = function(ref, config) {
    const booksWithDashRegex = /^(joseph|조셉)/i; // TODO: get from config
    //todo: better handling of multi-book ranges for unicode
    if (!booksWithDashRegex.test(ref) && ref.match(/[—-](\d\s)*[\D]/ig)) return lookupMultiBookRange(ref, config);
    let book = getBook(ref, config);
    if (!book) {
        return {
            verse_ids: [],
            error: `Book not recognized in reference: "${ref}"`
        };
    }
    let ranges = getRanges(ref, book);
    let verse_ids = loadVerseIds(book, ranges, config);
    return verse_ids;

}

const validateVerseIds = function(verse_ids) {

    if(!verse_ids) return false;
    if(typeof verse_ids === 'string') verse_ids = verse_ids.split(/[,;]/);
    if(!Array.isArray(verse_ids)) verse_ids = [verse_ids];
    verse_ids = verse_ids.map(v => parseInt(v));
    verse_ids = verse_ids.filter(v => !isNaN(v));
    if(verse_ids.length === 0) return false;
    //if array of non zero integers
    if(verse_ids.filter(v => v > 0).length === verse_ids.length) return verse_ids;
    return false;

}

const validateVerseIdsMixed = function(verse_ids) {
    if(!verse_ids) return { ids: false, canon: null };
    if(typeof verse_ids === 'string') verse_ids = verse_ids.split(/[,;]/);
    if(!Array.isArray(verse_ids)) verse_ids = [verse_ids];
    if(verse_ids.length === 0) return { ids: false, canon: null };

    // Detect canon from first ID
    const firstCanon = detectCanon(verse_ids[0]);
    if (!firstCanon) return { ids: false, canon: null };

    // Validate and normalize IDs
    if (firstCanon === CANON_COC) {
        const validIds = verse_ids.filter(id => detectCanon(id) === CANON_COC);
        return { ids: validIds.length > 0 ? validIds : false, canon: CANON_COC };
    } else {
        const validIds = validateVerseIds(verse_ids);
        return { ids: validIds, canon: CANON_LDS };
    }
}

const generateReference = function(verse_ids, language = null, options = {}) {
    const canon = options.canon || null;

    // Auto-detect if these are COC IDs
    const { ids, canon: detectedCanon } = validateVerseIdsMixed(verse_ids);
    if(!ids) return '';

    // Handle canon mismatch: if explicit canon conflicts with detected canon, return empty
    // This prevents crashes when e.g. COC IDs are passed with canon: 'lds' or vice versa
    if (canon && detectedCanon && canon !== detectedCanon) {
        console.warn(`Canon mismatch: requested ${canon} but IDs are ${detectedCanon}`);
        return '';
    }

    // Determine which canon to use: explicit option > auto-detected
    const effectiveCanon = canon || detectedCanon;

    // Use COC generator if COC canon specified or detected
    if (effectiveCanon === CANON_COC) {
        return generateReferenceCoc(ids, language);
    }

    const effectiveLanguage = getEffectiveLanguage(language);
    const config = getLanguageConfig(effectiveLanguage);
    let ranges = loadVerseStructure(ids, config);
    let refs = loadRefsFromRanges(ranges, config);

    let ref = refs.join("; ");
    return ref;

}


const lookupMultiBookRange = function(cleanRef, config) { //eg Matthew 15—Mark 2

    let range = cleanRef.split(/[—-]/);
    if (!range[0].match(/[:]/)) {
        if (range[0].match(/\d+\s*$/)) range[0] = range[0].trim() + ":" + 1;
        else range[0] = range[0].trim() + " 1:1";
    }
    if (!range[1].match(/[:]/)) {

        let matches = range[1].match(/(.*?)\s(\d+)$/);
        if (matches === null) {
            //find end of book
            let maxChapter = loadMaxChapter(range[1], config);
            let maxverse = loadMaxVerse(range[1], maxChapter, config);
            range[1] = range[1] + " " + maxChapter + ":" + maxverse;
           // console.log(range);
        } else {
            let maxverse = loadMaxVerse(cleanReference(matches[1], config), matches[2], config);
            range[1] = range[1] + ":" + maxverse;
        }
    }
    let start = lookupSingleRef(range[0], config)[0];
    let end = lookupSingleRef(range[1], config)[0];
    let all_verse_ids = [];
    for (let i = start; i <= end; i++) {
        if (all_verse_ids.length >= MAX_RANGE_SIZE) break;
        all_verse_ids.push(i);
    }
    return all_verse_ids;
}

const strToHash = function(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = hash * 31 + str.charCodeAt(i);
        //max 32
        if (hash > 2147483647) hash = hash % 2147483647;
    }
    return `==${hash}==`;
}


const cleanReference = function(messyReference, config) {

    let ref = messyReference.replace(/[\s]+/g, " ").trim();

    //Build Regex rules
    let regex = config.raw_regex.pre_rules;
    for (let i in regex) {
        var re = new RegExp(regex[i][0], "ig");
        ref = ref.replace(re, regex[i][1]);
    }

    //Turn dots into colons
    ref = ref.replace(/(\d+)[.](\d+)/g, "$1:$2");
    ref = ref.replace(/[.]/g, "");

    //Treat commas as semicolons in the absence of verses
    //add spaces after semicolons
    ref = ref.replace(/;/g, "; ");
    //add space before numbers
    ref = ref.replace(/^([0-9;,:-]+)(\d+)/g, "$1 $2");
    //spaces around book ranges !!! Breaks vietnamese, which uses dashes (optionally) instead of spaces in book names
    ref = ref.replace(/([–-])(\D+)/g, " $1 $2 ");

    //Handle non-latin languages because \b only works for latin alphabet
    const [wordBreak, buffer] = config.raw_regex.spacing || ["\\b", ""];

    let srcbooks = config.raw_regex.books;
    let dstbooks = buffer ? config.raw_regex.books.map(i => [i[1], i[1]]) : [];
    let bookMatchList = [...dstbooks, ...srcbooks].sort((a, b) => b[0].length - a[0].length);
    regex = bookMatchList;
    let hashCypher = {};
    for (let i in regex) {
        const [,book] = regex[i];
        const hash = strToHash(book);
        hashCypher[book] = hash;
    }
    for (let i in regex) {
        var re = new RegExp( wordBreak + buffer + regex[i][0] + buffer + "\\.*"+wordBreak, "ig");
        let replacement = hashCypher[regex[i][1]] || regex[i][1];
        ref = (buffer+ref+buffer).replace(re, replacement).trim();
    }
    const books = Object.keys(hashCypher);
    const hashes = Object.values(hashCypher);
    ref = ref.replace(new RegExp(hashes.join("|"), "g"), function (match) {
       const bookValue = books[hashes.indexOf((match))];
         return bookValue + " ";
    }
    );


    //Cleanup
    ref = ref.replace(/\s+/g, " "); //remove double spaces
    ref = ref.replace(/\s*[~–-]\s*/g, "-"); //remove spaces around dashes
    ref = ref.replace(/;(\S+)/g, "; $1"); //add space after semicolons

    let cleanReference = ref.trim();

    cleanReference = handleSingleChapterBookRefs(cleanReference, config);
    if (!cleanReference.match(/:/)) cleanReference = cleanReference.replace(/,/, "; ");
    return cleanReference;
}

const handleSingleChapterBookRefs = function(ref, config) {

   const singleChapterBooks = Object.keys(config.raw_index).filter(book => loadMaxChapter(book, config) === 1);
   const [matchingBook] = singleChapterBooks.filter(book => ref.match(new RegExp(`^${book} \\d+`)));
   if(new RegExp(`^${matchingBook} 1:`).test(ref)) return ref;
   if(new RegExp(`^${matchingBook} 1$`).test(ref)) return ref;
   ref = ref.replace(new RegExp(`^${matchingBook} (\\d+)`), `${matchingBook} 1:$1`);
   return ref;
}

const splitReferences = function(compoundReference, config) {
    let refs = compoundReference.split(/\s*;\s*/);
    let runningBook = "";
    let completeRefs = [];
    for (let i in refs) {
        const ref = refs[i];
        let pieces = ref.split(/([0-9:,-]+)$/);
        const firstPiece = pieces[0].trim();
        runningBook = bookExists(firstPiece, config) ? firstPiece : runningBook;
        const needsPreBook = !bookExists(firstPiece, config);
        const preBook = needsPreBook && runningBook ? runningBook : "";
        completeRefs.push((preBook + " " + ref).trim());
    }
    return completeRefs;
}
const getBook = function(ref, config) {
    let book = ref.replace(/([ 0-9:,-]+)$/, '').trim();
    book = book.replace(/-/g, "—");
    if (bookExists(book, config)) return book;
    return false;
}
const getRanges = function(ref) {
    let ranges = [];
    let numbers = ref.replace(/.*?([0-9: ,-]+)$/, '$1').trim();
    numbers=numbers.replace(/^(\d+)-(\d+):(\d+)$/g, '$1:1-$2:$3'); //implict first verse
    let isChaptersOnly = numbers.match(/:/) ? false : true;
    let isRange = !numbers.match(/-/) ? false : true;
    let isSplit = !numbers.match(/,/) ? false : true;
    // Genesis 1,3-5
    if (isChaptersOnly && isSplit && isRange) {
        let chapterRanges = numbers.split(/,/);
        for (let i in chapterRanges) {
            //3-5
            if (chapterRanges[i].match(/-/)) {
                let chapterStartandEnd = chapterRanges[i].split(/-/);
                let startChapter = parseInt(chapterStartandEnd[0], 0);
                let endChapter = parseInt(chapterStartandEnd[1], 0);
                let chapterRange = [];
                for (let i = startChapter; i <= endChapter; i++) {
                    ranges.push(i + ": 1-X");
                }
            }
            //1
            else {
                ranges.push(chapterRanges[i] + ": 1-X");
            }
        }
    }
    // Genesis 1,3
    else if (isChaptersOnly && isSplit) {
        let chapters = numbers.split(/,/);
        ranges = chapters.map(chapter => chapter + ": 1-X");
    }
    //Genesis 1-2 (ch-ch)
    else if (isChaptersOnly && isRange) {
        let chapterStartandEnd = numbers.split(/-/);
        let startChapter = parseInt(chapterStartandEnd[0], 0);
        let endChapter = parseInt(chapterStartandEnd[1], 0);
        let chapterRange = [];
        for (let i = startChapter; i <= endChapter; i++) {
            chapterRange.push(i);
        }
        ranges = chapterRange.map(chapter => chapter + ": 1-X");
    }
    //Genesis 1
    else if (isChaptersOnly) {
        ranges = [numbers + ": 1-X"];
    }
    //Genesis 1:1-5,10   
    else if (isRange && isSplit) {
        let mostRecentChapter = null;
        let split = numbers.split(/,/);
        let chapter = null;
        let verses = null;
        for (let i in split) {
            // 2:2   OR   1:1-4
            if (split[i].match(/:/)) {
                let pieces = split[i].split(/:/);
                chapter = mostRecentChapter = pieces[0];
                verses = pieces[1];
            }
            //3   or 6-7
            else {
                chapter = mostRecentChapter;
                verses = split[i];
            }
            ranges.push(chapter + ": " + verses.trim());
        }
    }
    // Genesis 1:3,5
    else if (isSplit) {
        let split = numbers.split(/,/);
        let mostRecentChapter = null;
        let chapter = null;
        let verses = null;
        for (let i in split) {
            //Genesis 1:1-5
            if (split[i].match(/:/)) {
                let pieces = numbers.split(/:/);
                chapter = mostRecentChapter = pieces[0];
                verses = pieces[1];
            }
            //10
            else {
                chapter = mostRecentChapter;
                verses = split[i];
            }
            ranges.push(chapter + ": " + verses.trim());
        }
    }
    //Genesis 1:1-10 (cv-v)    OR    Exodus 1-2:15 (c-cv)  OR Leviticus 1:10-2:5 (cv-cv)
    else if (isRange) {
        let chapters = numbers.match(/((\d+)[:]|^\d+)/g);
        let verses = numbers.match(/[:-](\d+)/g);
        if (chapters.length === 1) chapters.push(chapters[0]);
        chapters = chapters.map(c => parseInt(c.replace(/\D/g, '').trim()));
        verses = verses.map(v => parseInt(v.replace(/\D/g, '').trim()));
        for (let i = chapters[0]; i <= chapters[1]; i++) {
            let start = 1;
            let end = "X";
            if (chapters[0] === i) start = verses[0];
            if (chapters[1] === i) end = verses[verses.length - 1];
            ranges.push(i + ": " + start + "-" + end);
        }
    } else {
        ranges = [numbers];
    };
    return ranges;
}
const loadVerseIds = function(book, ranges, config) {
    let refIndex = loadRefIndex(config);
    let verseList = [];

    for (let i in ranges) {
        // Bounds check: stop if we've collected enough
        if (verseList.length >= MAX_RANGE_SIZE) break;

        let range = ranges[i];
        let matches = range.match(/(\d+): *([\dX]+)-*([\dX]*)/);
        if (!matches) continue;

        let chapter = parseInt(matches[1]);
        let start = parseInt(matches[2]);
        let end = matches[3];

        // Validate chapter bounds
        if (chapter < 1 || chapter > MAX_CHAPTER) continue;

        if (end === '') end = start;
        if (end === 'X') end = loadMaxVerse(book, chapter, config);
        else end = parseInt(end);

        // Validate verse bounds
        start = Math.max(1, Math.min(start, MAX_VERSE));
        end = Math.max(start, Math.min(end, MAX_VERSE));

        for (let verse_num = start; verse_num <= end; verse_num++) {
            if (verseList.length >= MAX_RANGE_SIZE) break;
            if (refIndex[book]?.[chapter]?.[verse_num]) {
                verseList.push(refIndex[book][chapter][verse_num]);
            }
        }
    }
    return verseList;
}
const loadVerseStructure = function(verse_ids, config) {
    let verseIdIndex = loadVerseIdIndex(config);
    let segments = consecutiveSplitter(verse_ids);
    let structure = [];
    for (let i in segments) {
        let min = segments[i][0];
        let max = segments[i][segments[i].length - 1];
        structure.push([verseIdIndex[min], verseIdIndex[max]]);
    }
    return structure;
}
const consecutiveSplitter = function(verse_ids) {
    let segments = [];
    let segment = [];
    let previousVerseId = 0;
    for (let i in verse_ids) {
        if (verse_ids[i] !== previousVerseId + 1 && previousVerseId !== 0) {
            segments.push(segment);
            segment = [];
        }
        segment.push(verse_ids[i]);
        previousVerseId = verse_ids[i];
    }
    segments.push(segment);
    return segments;
}
const loadRefsFromRanges = function(ranges, config) {
    let refs = [];
    let mostRecentBook, mostRecentChapter;
    for (let i in ranges) {
        let ref = '';
        let start_bk = ranges[i][0][0];
        let end_bk = ranges[i][1][0];
        let start_ch = ranges[i][0][1];
        let end_ch = ranges[i][1][1];
        let start_vs = ranges[i][0][2];
        let end_vs = ranges[i][1][2];
        if (start_bk === end_bk) {
            if (start_ch === end_ch) {
                if (start_bk === mostRecentBook) start_bk = '';
                if (start_bk === mostRecentBook && start_ch === mostRecentChapter) start_ch = '';
                if (start_vs === end_vs) {
                    ref = start_bk + " " + start_ch + ":" + start_vs;
                } else {
                    if (start_vs === 1 && end_vs === loadMaxVerse(start_bk, start_ch, config)) //whole chapter
                    {
                        ref = start_bk + " " + start_ch;
                    } else {
                        ref = start_bk + " " + start_ch + ":" + start_vs + "-" + end_vs;
                    }
                }
            } else {
                if (start_vs === 1 && end_vs === loadMaxVerse(end_bk, end_ch, config)) {
                    ref = start_bk + " " + start_ch + "-" + end_ch;
                } else {
                    ref = start_bk + " " + start_ch + ":" + start_vs + "-" + end_ch + ":" + end_vs;
                }
            }
        } else {
            if (start_vs === 1 && end_vs === loadMaxVerse(end_bk, end_ch, config)) {
                ref = start_bk + " " + start_ch + " - " + end_bk + " " + end_ch;
            } else if (end_vs === loadMaxVerse(end_bk, end_ch, config)) {
                ref = start_bk + " " + start_ch + ":" + start_vs + " - " + end_bk + " " + end_ch;
            } else if (start_vs === 1) {
                ref = start_bk + " " + start_ch + " - " + end_bk + " " + end_ch + ":" + end_vs;
            } else {
                ref = start_bk + " " + start_ch + ":" + start_vs + " - " + end_bk + " " + end_ch + ":" + end_vs;
            }
        }
        if (start_bk !== '') mostRecentBook = start_bk;
        if (start_ch !== '') mostRecentChapter = start_ch;
        ref = ref.replace(/^\s+:*/, '').trim();

        // Apply language-specific post rules
        if (config.raw_regex.post_rules) {
            for (let rule of config.raw_regex.post_rules) {
                const re = new RegExp(rule[0], "ig");
                ref = ref.replace(re, rule[1]);
            }
        }
        
        refs.push(ref);
    }
    return refs;
}

const loadRefIndex = function(config) {
    const configHash = hashConfig(config);

    // Return cached if available and config unchanged
    if (indexCache.refIndex && indexCache.configHash === configHash) {
        return indexCache.refIndex;
    }

    let refIndex = {};
    let verse_id = 1;
    let book_list = Object.keys(config.raw_index);
    for (let a in book_list) {
        let book_title = book_list[a];
        refIndex[book_title] = {};
        for (let b in config.raw_index[book_title]) {
            let chapter_num = parseInt(b) + 1;
            let verse_max = config.raw_index[book_title][b];
            refIndex[book_title][chapter_num] = {};
            for (var verse_num = 1; verse_num <= verse_max; verse_num++) {
                refIndex[book_title][chapter_num][verse_num] = verse_id;
                verse_id++;
            }
        }
    }

    // Cache the result
    indexCache.refIndex = refIndex;
    indexCache.configHash = configHash;

    return refIndex;
}


const loadVerseIdIndex = function(config) {
    const configHash = hashConfig(config);

    // Return cached if available and config unchanged
    if (indexCache.verseIdIndex && indexCache.configHash === configHash) {
        return indexCache.verseIdIndex;
    }

    let verseIdIndex = [null]; // 1-indexed
    let book_list = Object.keys(config.raw_index);
    for (let a in book_list) {
        let book_title = book_list[a];
        for (let b in config.raw_index[book_title]) {
            let chapter_num = parseInt(b) + 1;
            let verse_max = config.raw_index[book_title][b];
            for (var verse_num = 1; verse_num <= verse_max; verse_num++) {
                verseIdIndex.push([book_title, chapter_num, verse_num]);
            }
        }
    }

    // Cache the result
    indexCache.verseIdIndex = verseIdIndex;
    indexCache.configHash = configHash;

    return verseIdIndex;
}


const bookExists = function(book, config) {
    if (config.raw_index[book] === undefined) return false;
    return true;
}


const loadMaxChapter = function(book, config) {

    if (!bookExists(book, config)) return 0;
    return config.raw_index[book].length;
}

const loadMaxVerse = function(book, chapter, config) {

    if (!bookExists(book, config)) return 0;
    return config.raw_index[book][parseInt(chapter) - 1]
}

const detectReferences = (content, callBack, options = null) => {
    // Handle legacy API: (content, callback, language)
    if (typeof options === 'string' || options === null) {
        const language = options;
        options = { language };
    }
    
    // Default options
    const defaultOptions = {
        language: null,
        contextAware: true,
        contextScope: 'sentence',
        maxContextDistance: 500,
        enableImpliedBooks: true,
        enableVerseAbbrev: true
    };
    
    const finalOptions = { ...defaultOptions, ...options };
    callBack = callBack ? callBack : (i)=>{return `[${i}]`};
    
    const effectiveLanguage = getEffectiveLanguage(finalOptions.language);
    const config = getLanguageConfig(effectiveLanguage);
    const src = config.raw_regex.books.map(i => i[0]);
    const dst = [...new Set(config.raw_regex.books.map(i => i[1]))];
    const books = [...dst, ...src];
    
    // Use enhanced processing if context-aware mode is enabled
    if (finalOptions.contextAware) {
        return detectReferencesWithContext(content, books, config.lang_extra, (query) => lookupReference(query, effectiveLanguage), callBack, finalOptions, generateReference);
    }
    
    // Fallback to original processing
    return processReferenceDetection(content, books, config.lang_extra, (query) => lookupReference(query, effectiveLanguage), callBack);
}

const getLanguageConfig = function(language, canon = null) {
    const effectiveCanon = getEffectiveCanon(canon);

    // Get merged language data from data-loader (shared + parent + canon)
    const langData = getLanguageData(effectiveCanon, language || 'en');

    // If language not found, fall back to English
    const effectiveLanguage = langData ? (language || 'en') : 'en';
    const effectiveLangData = langData || getLanguageData(effectiveCanon, 'en');

    if (!effectiveLangData) {
        // Ultimate fallback - return minimal config
        return {
            language: 'en',
            raw_index: {},
            raw_regex: { books: [], pre_rules: [], post_rules: [], joiners: [] },
            lang_extra: { joiners: [] },
            wordBreak: "\\b"
        };
    }

    // Build the legacy index format from structure
    const raw_index = buildLegacyIndex(effectiveCanon, effectiveLangData);

    // Build books regex from language data
    const booksRegex = buildBooksRegex(effectiveLangData);

    const config = {
        language: effectiveLanguage,
        raw_index: raw_index,
        raw_regex: {
            books: booksRegex,
            pre_rules: effectiveLangData.pre_rules || [],
            post_rules: effectiveLangData.post_rules || [],
            joiners: effectiveLangData.joiners || [],
            spacing: effectiveLangData.spacing || ["\\b", ""]
        },
        lang_extra: effectiveLangData.matchRules || {},
        wordBreak: effectiveLangData.wordBreak || "\\b"
    };

    // Ensure joiners are available in lang_extra
    config.lang_extra.joiners = config.lang_extra.joiners || config.raw_regex.joiners;

    return config;
}


export {
    lookupReference,
    generateReference,
    setLanguage,
    detectReferences,
    convertCanon,
    setCanon,
    getCanon,

    //Aliases for convenience
    setLanguage as lang,
    setLanguage as language,
    setLanguage as setLang,

    lookupReference as lookup,
    lookupReference as parse,
    lookupReference as read,
    lookupReference as ref2VerseId,

    generateReference as ref,
    generateReference as gen,
    generateReference as generate,
    generateReference as verseId2Ref,

    detectReferences as detect,
    detectReferences as detectScriptureReferences,
    detectReferences as detectRefs,
    detectReferences as detectScriptures,
    detectReferences as linkRefs,
};