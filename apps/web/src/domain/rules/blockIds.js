// Verse ids of a PHP reference block { orig, book, verse_ids }: verse_ids may be false (no book)
// or hold nulls (a multi-book range whose ends matched nothing).
export const blockVerseIds = block => (Array.isArray(block.verse_ids) ? block.verse_ids.filter(id => id != null) : []);

// A block PHP rendered as an empty section: verse ids listed, none of them a verse ([null]).
export const isEmptyRange = block => Array.isArray(block.verse_ids) && block.verse_ids.length > 0 && !blockVerseIds(block).length;
