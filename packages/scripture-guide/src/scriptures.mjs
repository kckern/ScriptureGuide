// Data loaded from compiled YAML
import { scriptData, regexData, langData, extraCanons } from './lib/data-loader.mjs';
const raw_index_orig = scriptData;
const raw_regex_orig = regexData;
const raw_lang = langData;

import { processReferenceDetection, collectReferences } from './scriptdetect.mjs';
import { detectReferencesWithContext, collectReferencesWithContext } from './scriptdetectcontext.mjs';
import { detectCanon, formatId, parseId, convertCanon, registerCanon, registerMapping } from './scriptcanon.mjs';
import { toSlug } from './slug.mjs';

import {
  MAX_RANGE_SIZE,
  MAX_CHAPTER,
  MAX_VERSE,
  MAX_QUERY_LENGTH,
  DEFAULTS
} from './config.mjs';

// Register the default canon to accept plain integers
// This is data-driven - the canon key comes from config, not hardcoded
registerCanon(DEFAULTS.canon, {
  acceptsInteger: true,
  pattern: /^\d+$/,
  format: (n) => n,
  parse: (s) => parseInt(s, 10)
});

// Register additional canons and their concordances from data.
// These use plain integers in their own id space; bare integers with no
// explicit canon still resolve to the default canon, so no acceptsInteger.
for (const [canonKey, canonData] of Object.entries(extraCanons)) {
  registerCanon(canonKey, {
    format: (n) => n,
    parse: (s) => (typeof s === 'number' ? s : parseInt(s, 10))
  });
  for (const [targetKey, mapping] of Object.entries(canonData.mappings || {})) {
    // canonA = target canon, so aToB is target->thisCanon
    registerMapping(targetKey, canonKey, {
      aToB: mapping.fromTarget,
      bToA: mapping.toTarget
    });
  }
}

// Module-level caches for performance
const indexCache = {
  refIndex: null,
  refIndexHash: null,
  verseIdIndex: null,
  verseIdIndexHash: null
};

const hashConfig = (config) => {
  // Hash based on language AND canon for proper cache invalidation —
  // rlds and lds share book names but have different verse structures
  return (config?.language || 'en') + ':' + (config?.canon || DEFAULTS.canon);
};

// Browser localStorage keys for preferences
const LANGUAGE_STORAGE_KEY = 'scriptureGuideUtils_language';
const CANON_STORAGE_KEY = 'scriptureGuideUtils_canon';

// Helper function to safely access localStorage
const getStoredValue = (key) => {
    try {
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem(key);
        }
    } catch (e) {
        // localStorage might not be available in some environments
    }
    return null;
};

const setStoredValue = (key, value) => {
    try {
        if (typeof localStorage !== 'undefined') {
            if (value) {
                localStorage.setItem(key, value);
            } else {
                localStorage.removeItem(key);
            }
        }
    } catch (e) {
        // localStorage might not be available in some environments
    }
};

// Global defaults (can be overridden by localStorage)
let defaultLanguage = null;
let defaultCanon = null;

const setLanguage = function(language) {
    defaultLanguage = language;
    setStoredValue(LANGUAGE_STORAGE_KEY, language);
};

const setCanon = function(canon) {
    defaultCanon = canon;
    setStoredValue(CANON_STORAGE_KEY, canon);
};

const getEffectiveLanguage = function(explicitLanguage) {
    // Priority: explicit parameter > stored language > default language > 'en'
    return explicitLanguage || getStoredValue(LANGUAGE_STORAGE_KEY) || defaultLanguage || 'en';
};

const getEffectiveCanon = function(explicitCanon) {
    // Priority: explicit parameter > stored canon > default canon > config default
    return explicitCanon || getStoredValue(CANON_STORAGE_KEY) || defaultCanon || DEFAULTS.canon;
};

const lookupReference = function(query, optionsOrLanguage = {}, legacyConfig = null) {
    // Handle backward compatibility: old signature was (query, language, lookupConfig)
    // New signature is (query, options) where options can be string (language) or object
    let language = null;
    let lookupConfig = {};

    if (legacyConfig !== null) {
        // Old 3-parameter signature: (query, language, lookupConfig)
        console.warn('DEPRECATED: lookupReference(query, language, config) is deprecated. Use lookupReference(query, { language, ...config }) instead.');
        language = optionsOrLanguage;
        lookupConfig = legacyConfig || {};
    } else if (typeof optionsOrLanguage === 'string') {
        // String options = language shorthand
        language = optionsOrLanguage;
    } else if (optionsOrLanguage && typeof optionsOrLanguage === 'object') {
        // Object options
        language = optionsOrLanguage.language || null;
        lookupConfig = optionsOrLanguage;
    }

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

    // Extract canon options, using effective canon as default
    const { convertTo, includeParallel } = lookupConfig;
    const canon = lookupConfig.canon || getEffectiveCanon();

    // Try lookup in the requested language (and canon versification)
    const lookupResult = lookupInLanguage(query, effectiveLanguage, canon);
    const verse_ids = lookupResult.verse_ids;
    const errors = lookupResult.errors;

    if (verse_ids?.length) {
        let result = {
            "query": query,
            "ref": generateReference(verse_ids, { language: effectiveLanguage, canon }),
            "verse_ids": verse_ids
        };

        // Handle convertTo option using generic canon conversion
        if (convertTo && convertTo !== canon) {
            result.sourceCanon = canon;
            const converted = convertCanon(verse_ids, { from: canon, to: convertTo });
            result.verse_ids = converted.verse_ids;
            result.partial = converted.partial;
            result.ref = generateReference(converted.verse_ids, { language: effectiveLanguage, canon: convertTo });
        }

        // Handle includeParallel option using generic canon conversion
        if (includeParallel && convertTo) {
            const parallelCanon = convertTo;
            const parallelConverted = convertCanon(verse_ids, { from: canon, to: parallelCanon });
            result.parallel = {
                canon: parallelCanon,
                verse_ids: parallelConverted.verse_ids,
                ref: generateReference(parallelConverted.verse_ids, { language: effectiveLanguage, canon: parallelCanon }),
                partial: parallelConverted.partial
            };
        }

        return result;
    }

    // If no results and multi-language lookup is allowed, try fallback languages
    if (!lookupConfig.noMulti) {
        const fallbackResult = lookupWithLanguageFallback(query, effectiveLanguage, canon);
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

const lookupInLanguage = function(query, language, canon = null) {
    const config = getLanguageConfig(language, canon);

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


const lookupWithLanguageFallback = function(query, targetLanguage, canon = null) {
    // Define fallback order: English first (if not already tried), then all other languages
    const fallbackLanguages = targetLanguage !== 'en'
        ? ['en', ...Object.keys(raw_lang).filter(lang => lang !== 'en' && lang !== targetLanguage)]
        : Object.keys(raw_lang).filter(lang => lang !== targetLanguage);

    for (const lang of fallbackLanguages) {
        const lookupResult = lookupInLanguage(query, lang, canon);
        const verse_ids = lookupResult.verse_ids;
        if (verse_ids?.length) {
            // Generate reference in the target language
            const refInTargetLanguage = generateReference(verse_ids, { language: targetLanguage, canon });
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

    // Detect canon from first ID using the registry
    const firstCanon = detectCanon(verse_ids[0]);
    if (!firstCanon) return { ids: false, canon: null };

    // Filter IDs that match the detected canon
    const validIds = verse_ids.filter(id => detectCanon(id) === firstCanon);
    return { ids: validIds.length > 0 ? validIds : false, canon: firstCanon };
}

const generateReference = function(verse_ids, optionsOrLanguage = {}, legacyOptions = null) {
    // Handle backward compatibility: old signature was (verse_ids, language, options)
    // New signature is (verse_ids, options) where options can be string (language) or object
    let language = null;
    let canon = null;

    if (legacyOptions !== null) {
        // Old 3-parameter signature: (verse_ids, language, options)
        console.warn('DEPRECATED: generateReference(ids, language, options) is deprecated. Use generateReference(ids, { language, ...options }) instead.');
        language = optionsOrLanguage;
        canon = legacyOptions?.canon || null;
    } else if (typeof optionsOrLanguage === 'string') {
        // String options = language shorthand
        language = optionsOrLanguage;
    } else if (optionsOrLanguage && typeof optionsOrLanguage === 'object') {
        // Object options
        language = optionsOrLanguage.language || null;
        canon = optionsOrLanguage.canon || null;
    }

    // Validate and detect canon from IDs
    const { ids, canon: detectedCanon } = validateVerseIdsMixed(verse_ids);
    if(!ids) return '';

    // Plain integers are not self-describing across canons (lds and rlds id
    // spaces overlap), so an explicit canon always wins; detection only
    // applies when no canon was given.
    const effectiveCanon = canon || detectedCanon || null;

    const effectiveLanguage = getEffectiveLanguage(language);
    const config = getLanguageConfig(effectiveLanguage, effectiveCanon);
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

    // Verse/chapter continuation: "16:17 and 18" -> "16:17,18"
    ref = ref.replace(/(\d)\s+and\s+(\d)/g, "$1,$2");
    // Drop parens and D&C "Sec."/"Section" markers before a number:
    // "Philippians (3:20, 21)" / "Doctrine and Covenants, Sec. 93:29".
    ref = ref.replace(/[()]/g, " ");
    ref = ref.replace(/\bsec(?:tion)?\b\.?/ig, " ");

    //Build Regex rules
    let regex = config.raw_regex.pre_rules;
    for (let i in regex) {
        // pre_rules are {pattern, replacement} objects (legacy: [pattern, replacement]).
        var re = new RegExp(regex[i].pattern ?? regex[i][0], "ig");
        ref = ref.replace(re, regex[i].replacement ?? regex[i][1] ?? "");
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
        // A range across books ("Malachi 4:5-Matthew 1:2") names its own books: keep it whole,
        // without the running book, and continue with the book it ends in
        const multiBook = ref.match(/^(.*?\D)\s*\d[\d:,]*\s*[—-]\s*((?:\d\s*)?\D+?)\s*\d[\d:,]*$/);
        if (multiBook && bookExists(multiBook[1].trim(), config) && bookExists(multiBook[2].trim(), config)) {
            runningBook = multiBook[2].trim();
            completeRefs.push(ref.trim());
            continue;
        }
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
                // pre_rules/post_rules migrated to {pattern, replacement} objects;
                // keep legacy [pattern, replacement] tuple support. Guard the
                // replacement so an undefined never coerces to the literal
                // "undefined" via String.replace (the ko regression).
                const re = new RegExp(rule.pattern ?? rule[0], "ig");
                ref = ref.replace(re, rule.replacement ?? rule[1] ?? "");
            }
        }
        
        refs.push(ref);
    }
    return refs;
}

const loadRefIndex = function(config) {
    const configHash = hashConfig(config);

    // Return cached if available and config unchanged
    if (indexCache.refIndex && indexCache.refIndexHash === configHash) {
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
    indexCache.refIndexHash = configHash;

    return refIndex;
}


const loadVerseIdIndex = function(config) {
    const configHash = hashConfig(config);

    // Return cached if available and config unchanged
    if (indexCache.verseIdIndex && indexCache.verseIdIndexHash === configHash) {
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
    indexCache.verseIdIndexHash = configHash;

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

// Merging adjacent references across a prose marker ("see also", "cf.") is right
// for lookupReference — "A; see also B" is one verse set — but wrong for the
// detectors, which linkify prose: merging swallows the connective words out of
// the rendered text. chainAcrossMarkers: false restricts the joiner list to
// structural separators so markers stay outside the link.
const STRUCTURAL_JOINERS = [';', ',', '&', 'and'];
// Structural = no letters (";",",","&") or the conjunction "and". Everything else
// in the joiner list is a prose marker (see also / cf / compare / cited at / see).
const isStructuralJoiner = (token) =>
    typeof token === 'string' && (!/[a-z]/i.test(token) || token.trim().toLowerCase() === 'and');
const restrictJoinersToStructural = (lang_extra) => {
    const src = lang_extra || {};
    const j = src.joiners;
    let joiners;
    if (Array.isArray(j)) {
        joiners = j.filter(isStructuralJoiner);
        if (!joiners.length) joiners = [...STRUCTURAL_JOINERS];
    } else if (j && Array.isArray(j.patterns)) {
        const patterns = j.patterns.filter(isStructuralJoiner);
        joiners = patterns.length ? { ...j, patterns } : [...STRUCTURAL_JOINERS];
    } else {
        joiners = [...STRUCTURAL_JOINERS];
    }
    // The restriction governs MERGING only. Book-context inheritance for an
    // implied "6:2" must still recognise "; see also " as a citation joiner, so
    // the full list is preserved alongside the restricted one.
    return { ...src, joiners, unrestrictedJoiners: src.joiners };
};

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
        enableVerseAbbrev: true,
        chainAcrossMarkers: true,
        // A bare "6:3" binds to an earlier book only when the token before it is
        // citation material. false restores pre-1.0.98 distance-only binding.
        strictImpliedBooks: true
    };

    const finalOptions = { ...defaultOptions, ...options };
    callBack = callBack ? callBack : (i)=>{return `[${i}]`};

    const effectiveLanguage = getEffectiveLanguage(finalOptions.language);
    const config = getLanguageConfig(effectiveLanguage);
    const src = config.raw_regex.books.map(i => i[0]);
    const dst = [...new Set(config.raw_regex.books.map(i => i[1]))];
    const books = [...dst, ...src];
    // Clone rather than mutate: config.lang_extra is shared and cached.
    const langExtra = finalOptions.chainAcrossMarkers === false
        ? restrictJoinersToStructural(config.lang_extra)
        : config.lang_extra;

    // Use enhanced processing if context-aware mode is enabled
    if (finalOptions.contextAware) {
        return detectReferencesWithContext(content, books, langExtra, (query) => lookupReference(query, effectiveLanguage), callBack, finalOptions, generateReference);
    }

    // Fallback to original processing
    return processReferenceDetection(content, books, langExtra, (query) => lookupReference(query, effectiveLanguage), callBack);
}

// Position-based sibling of detectReferences: instead of returning a
// transformed string, return the detected references as structured records
// with offsets into `content`: [{ start, end, text, ref, verse_ids }] where
// content.slice(start, end) === text. Consumers (e.g. the browser extension)
// use the offsets to wrap matches in DOM nodes without string replacement.
const findReferences = (content, options = null) => {
    // Handle legacy API: (content, language)
    if (typeof options === 'string' || options === null) {
        options = { language: options };
    }

    const defaultOptions = {
        language: null,
        contextAware: true,
        contextScope: 'sentence',
        maxContextDistance: 500,
        enableImpliedBooks: true,
        enableVerseAbbrev: true,
        abbreviations: true,
        chapterOnly: true,
        chainAcrossMarkers: true,
        // A bare "6:3" binds to an earlier book only when the token before it is
        // citation material. false restores pre-1.0.98 distance-only binding.
        strictImpliedBooks: true
    };

    const finalOptions = { ...defaultOptions, ...options };

    const effectiveLanguage = getEffectiveLanguage(finalOptions.language);
    const config = getLanguageConfig(effectiveLanguage);
    const src = config.raw_regex.books.map(i => i[0]);
    const dst = [...new Set(config.raw_regex.books.map(i => i[1]))];
    const books = [...dst, ...src];
    const lookup = (query) => lookupReference(query, effectiveLanguage);
    // Clone rather than mutate: config.lang_extra is shared and cached.
    const langExtra = finalOptions.chainAcrossMarkers === false
        ? restrictJoinersToStructural(config.lang_extra)
        : config.lang_extra;

    const found = finalOptions.contextAware
        ? collectReferencesWithContext(content, books, langExtra, lookup, finalOptions)
        : collectReferences(content, books, langExtra, lookup);

    // `ref` is a canonical, scripture.guide-resolvable string derived from the
    // resolved verse_ids (uniform across both collection paths); `text` remains
    // the verbatim matched span for DOM consumers.
    let records = found
        .filter(m => m.verse_ids.length > 0)
        .map(({ start, end, text, verse_ids }) => ({
            start, end, text, verse_ids,
            ref: generateReference(verse_ids, effectiveLanguage)
        }));

    // Supplementary pass: spelled-out "Nth chapter of BOOK" forms, which the
    // numeric detector cannot see. Merge in any that don't overlap an existing
    // numeric match, then re-sort by position.
    const spelled = collectSpelledOut(content, lookup, effectiveLanguage)
        .filter(sp => !records.some(r => sp.start < r.end && r.start < sp.end));
    if (spelled.length) {
        records = [...records, ...spelled].sort((a, b) => a.start - b.start);
    }

    return applyDetectionFlags(records, finalOptions);
}

// English ordinal words -> number, covering 1..39 (single words + twenty-/
// thirty- compounds), which spans the chapters/verses that appear spelled out
// in practice. Compound cardinals ("one hundred and second") are not covered.
const ORDINAL_ONES = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'];
const ORDINAL_TEENS = { tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19 };
const ORDINAL_TENS = { twentieth: 20, thirtieth: 30 };
const CARDINAL_TENS = { twenty: 20, thirty: 30 };
const ORDINAL_WORD_RE = '(?:' +
    'twenty-(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)|' +
    'thirty-(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)|' +
    Object.keys(ORDINAL_TENS).join('|') + '|' +
    Object.keys(ORDINAL_TEENS).join('|') + '|' +
    ORDINAL_ONES.slice(1).join('|') +
    ')';

const ordinalToNumber = (word) => {
    const digit = word.match(/^(\d+)(?:st|nd|rd|th)?$/i);
    if (digit) return parseInt(digit[1], 10);
    const w = word.toLowerCase();
    if (ORDINAL_TEENS[w] != null) return ORDINAL_TEENS[w];
    if (ORDINAL_TENS[w] != null) return ORDINAL_TENS[w];
    const dash = w.split('-');
    if (dash.length === 2 && CARDINAL_TENS[dash[0]] != null) {
        const one = ORDINAL_ONES.indexOf(dash[1]);
        if (one > 0) return CARDINAL_TENS[dash[0]] + one;
    }
    const one = ORDINAL_ONES.indexOf(w);
    return one > 0 ? one : null;
};

// A digit- or word-ordinal, e.g. "13th" or "fifteenth".
const ANY_ORDINAL = '(\\d+(?:st|nd|rd|th)|' + ORDINAL_WORD_RE + ')';
const BOOK_TAIL = '(?:the\\s+)?(?:book\\s+of\\s+)?((?:(?:First|Second|Third|Fourth|1st|2nd|3rd|4th|I{1,3}|IV)\\s+)?[A-Z][a-zA-Z]+)';
// The regexes run case-insensitively, so validate case/context in JS instead:
// the book must be Capitalized (else "job hunting" -> Job), and must not be a
// person ("Matthew Henry’s commentary", "James Brown’s book").
const isCapitalized = (s) => /^[A-Z]/.test(s);
const followsAsName = (content, end) => /^(?:['’]s\b|\s+[A-Z][a-z])/.test(content.slice(end));

// Detect spelled-out references the numeric matcher cannot see:
//  - "the 13th/second/fifteenth chapter of [the book of] BOOK"     -> BOOK N
//  - "the Nth verse of the Mth chapter of BOOK"                    -> BOOK M:N
// The trailing book candidate is validated via lookupReference, so non-book
// phrases ("13th chapter of His Gospel") are rejected. Returns position records.
const collectSpelledOut = (content, lookup, effectiveLanguage) => {
    const out = [];
    const push = (start, end, query) => {
        const result = lookup(query);
        if (!result.verse_ids || !result.verse_ids.length) return;
        out.push({
            start, end,
            text: content.substring(start, end),
            verse_ids: result.verse_ids,
            ref: generateReference(result.verse_ids, effectiveLanguage)
        });
    };

    // "Nth verse of the Mth chapter of BOOK" (check first — longer span).
    const verseRe = new RegExp('\\b(?:the\\s+)?' + ANY_ORDINAL + '\\s+verse\\s+of\\s+the\\s+' + ANY_ORDINAL + '\\s+chapter\\s+of\\s+' + BOOK_TAIL, 'ig');
    const claimed = [];
    let m;
    while ((m = verseRe.exec(content)) !== null) {
        const verse = ordinalToNumber(m[1]);
        const chapter = ordinalToNumber(m[2]);
        const e0 = m.index + m[0].length;
        if (verse == null || chapter == null || !isCapitalized(m[3]) || followsAsName(content, e0)) continue;
        const s = m.index + m[0].indexOf(m[1]);
        claimed.push([s, e0]);
        push(s, e0, `${m[3]} ${chapter}:${verse}`);
    }

    // "Nth chapter of BOOK"
    const chapRe = new RegExp('\\b(?:the\\s+)?' + ANY_ORDINAL + '\\s+chapter\\s+of\\s+' + BOOK_TAIL, 'ig');
    while ((m = chapRe.exec(content)) !== null) {
        const chapter = ordinalToNumber(m[1]);
        const e = m.index + m[0].length;
        if (chapter == null || !isCapitalized(m[2]) || followsAsName(content, e)) continue;
        const s = m.index + m[0].indexOf(m[1]);
        if (claimed.some(([cs, ce]) => s < ce && cs < e)) continue; // inside a verse-of-chapter match
        push(s, e, `${m[2]} ${chapter}`);
    }

    return out.sort((a, b) => a.start - b.start);
}

// The book portion of a reference string: everything before the first
// space-delimited number (the chapter). "Mt 5:3" -> "Mt", "1 Ne 3:7" -> "1 Ne".
const bookPortion = (s) => {
    const m = s.match(/^\s*(.*?)\s+\d/);
    return (m ? m[1] : s).trim().toLowerCase();
};

// A reference has a verse component when a chapter number is followed by a
// ":" or "." and a verse number ("John 3:16", "1 Nephi 8.15"); a bare
// book+chapter ("Genesis 2") does not.
const hasVerseComponent = (text) => /\d\s*[:.]\s*\d/.test(text);

// Post-collection filters for the abbreviations / chapterOnly options. Grouped
// citations (joiner-merged, so text contains ";" "," or " and ") always survive
// — the flags target single-reference matches.
const applyDetectionFlags = (records, opts) => {
    const isGrouped = (text) => /[;,]| and /i.test(text);
    let out = records;
    if (opts.chapterOnly === false) {
        out = out.filter(m => isGrouped(m.text) || hasVerseComponent(m.text));
    }
    if (opts.abbreviations === false) {
        out = out.filter(m => isGrouped(m.text) || bookPortion(m.text) === bookPortion(m.ref));
    }
    return out;
}

const getLanguageConfig = function(language, canon = null) {
    // Default to English if no language specified or not found
    const effectiveLanguage = language && raw_lang[language] ? language : 'en';
    const effectiveCanon = canon && extraCanons[canon] ? canon : DEFAULTS.canon;

    const config = {
        language: effectiveLanguage,
        canon: effectiveCanon,
        raw_index: raw_index_orig,
        raw_regex: {...raw_regex_orig},
        lang_extra: {},
        wordBreak: "\\b"
    };

    // For English or if language not found, use defaults
    if (effectiveLanguage === 'en' || !raw_lang[effectiveLanguage]) {
        config.lang_extra.joiners = config.raw_regex.joiners;
        config.lang_extra.capitalizedOnly = config.raw_regex.capitalized_only || [];
        return applyCanonOverride(config, effectiveCanon);
    }

    // Process language-specific data
    const langData = raw_lang[effectiveLanguage];
    
    if(langData.books) {
        config.raw_regex.books = [];
        let new_index = {};
        const bookList = Object.keys(langData.books);
        for(let book of bookList) {
            const book_index = bookList.indexOf(book);
            const original_bookname = Object.keys(raw_index_orig)?.[book_index];
            if (original_bookname) {
                new_index[book] = raw_index_orig[original_bookname];
            }
            const matches = [book, ...langData.books[book]];
            config.raw_regex.books = config.raw_regex.books.concat(matches.map(i => [i, book]));
        }
        config.raw_index = new_index;
    }

    config.raw_regex.pre_rules = langData.pre_rules || config.raw_regex.pre_rules;
    config.raw_regex.post_rules = langData.post_rules || config.raw_regex.post_rules;
    config.raw_regex.spacing = langData.spacing || ["\\b", ""];
    config.lang_extra = langData.matchRules || {};
    config.lang_extra.joiners = config.lang_extra.joiners || config.raw_regex.joiners;
    config.wordBreak = langData.wordBreak || "\\b";

    return applyCanonOverride(config, config.canon);
}

// Swap in a non-default canon's verse structure and book regexes.
// Extra canons currently ship English book data only, so canon override
// replaces any language-specific book set.
const applyCanonOverride = function(config, effectiveCanon) {
    if (effectiveCanon === DEFAULTS.canon) return config;
    const canonData = extraCanons[effectiveCanon];
    if (!canonData) return config;
    config.raw_index = canonData.index;
    config.raw_regex.books = [...canonData.regexBooks];
    return config;
}


export {
    lookupReference,
    generateReference,
    setLanguage,
    setCanon,
    detectReferences,
    findReferences,
    convertCanon,
    toSlug,

    //Aliases for convenience
    setLanguage as lang,
    setLanguage as language,
    setLanguage as setLang,

    setCanon as canon,

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

    findReferences as find,
    findReferences as findRefs,
};