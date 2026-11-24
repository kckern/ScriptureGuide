// English false-positive guard. A bare abbreviation or number next to prose ("Wood Is 4,300 Years
// Old") reads as a reference, so each collected match is vetted against the text around it.
// Records without numeric offsets pass through untouched.

// Abbreviations that are also ordinary English words. They only match with a chapter:verse form.
const COMMON_ABBREVIATIONS = new Set(['is', 'am', 'so', 'he', 'ex', 'ho', 're', 'jo',
    // Product generations, names, months and columns: "Gen 2", "Rev 3.0", "Dan 2", "Mar 5", "Col 3"
    'gen', 'rev', 'num', 'dan', 'jud', 'mat', 'mar', 'col', 'phil', 'ez', 'hab']);

// A chapter-only match followed by a unit is a quantity: "Mark 5 times", "Job 3 people".
const UNIT_AFTER = new RegExp('^\\s*(?:%|(?:years?|yrs?|people|persons?|times|percent|million|billion|thousand|' +
    'km|miles?|days?|months?|weeks?|hours?|minutes?|seconds?|dollars?|feet|ft|kg|lbs?|pounds?|' +
    'items?|points?|votes?|children|kids|members|users|views|likes|shares|comments)\\b)', 'i');

// Abbreviations that stay linkable as chapter-only ("Ps 23", "Heb 11"). Any other abbreviated
// book followed by a bare chapter is too weak a signal. Numbered books ("1 Ne 3") and
// non-letter forms ("D&C 4") are always allowed.
const CHAPTER_ONLY_ABBREVIATIONS = new Set(['ps', 'psa', 'mt', 'matt', 'mk', 'lk', 'jn', 'rom', 'heb', 'isa',
    'lu', 'prov', 'eph', 'gal', 'deut', 'jer', 'ezek', 'zech', 'mal']);

// Implied verses ("v. 16") carry no book of their own.
const VERSE_MARKERS = new Set(['v', 'vv', 'vs', 'ver', 'vers', 'verse', 'verses']);

const normalizeBook = (b) => b.toLowerCase().replace(/[\s.]/g, '');

const VERSE_SEPARATOR = /\d\s*[:.]\s*\d/;

export const acceptMatch = (content, m) => {
    if (!m || typeof m.start !== 'number' || typeof m.end !== 'number') return true;
    const span = content.slice(m.start, m.end);
    const after = content.slice(m.end);
    // "Rev 3.0" is a version number: no verse is numbered zero.
    if (/\d\s*[:.]\s*0(?!\d)/.test(span)) return false;
    const hasVerse = VERSE_SEPARATOR.test(span);

    // "4,300" is a quantity, not chapter and verse. A comma after a verse ("Ps 119:105,160") is a list.
    const around = span + after.slice(0, 4);
    const grouped = /\d,\d{3}(?!\d)/.exec(around);
    if (grouped && !/[:.]/.test(around.slice(0, grouped.index))) return false;

    // A chapter-only match with no space before the number is a model or version name ("Gen2", "Rev3").
    if (!hasVerse && /^\s*(?:\d\s*)?[A-Za-z]+\.?\d/.test(span)) return false;

    // "Is", "Am", "So", "Gen"... need a verse.
    const book = /^\s*(?:\d\s*)?([A-Za-z]+)/.exec(span);
    if (book && COMMON_ABBREVIATIONS.has(book[1].toLowerCase()) && !hasVerse) return false;

    // An abbreviated book with a bare chapter ("Gen 2", "Jer 29") needs a verse to count as a citation.
    const bare = !hasVerse && /^\s*([A-Za-z][A-Za-z.\s]*?)\s*\d+\s*$/.exec(span);
    if (bare && m.ref) {
        const written = normalizeBook(bare[1]);
        const canonical = normalizeBook(m.ref.replace(/\s*\d.*$/, ''));
        if (written !== canonical && !VERSE_MARKERS.has(written) && !CHAPTER_ONLY_ABBREVIATIONS.has(written)) return false;
    }

    // Chapter-only followed by a unit word.
    if (!hasVerse && UNIT_AFTER.test(after)) return false;

    return true;
};

export const guardRecords = (content, records) => records.filter((m) => acceptMatch(content, m));
