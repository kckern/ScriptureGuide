/**
 * Scripture reference parser utility
 * A utility for biblical and scripture reference parsing that enables structured queries 
 * based on strings of traditional scripture references (e.g. John 3:16)
 */

/**
 * Result object returned by lookupReference
 */
export interface LookupResult {
  /** The original input query string */
  query: string;
  /** The cleaned and parsed reference string */
  ref: string;
  /** Array of verse IDs corresponding to the reference */
  verse_ids: number[];
}

/**
 * Callback function type for detectReferences
 */
export type DetectionCallback = (reference: string) => string;

/**
 * Supported language codes
 */
export type LanguageCode = 'en' | 'ko' | 'de' | 'fr' | 'swe' | 'ru' | 'jp' | 'vn' | 'tr' | 'sl' | 'eo' | null;

/**
 * Looks up a scripture reference and returns structured data
 * @param query - The scripture reference string to parse (e.g., "John 3:16")
 * @param language - Optional language code. If not provided, uses setLanguage value or defaults to 'en'
 * @returns Object containing the query, parsed reference, and verse IDs
 */
export function lookupReference(query: string, language?: LanguageCode): LookupResult;

/**
 * Generates a human-readable scripture reference from verse IDs
 * @param verseIds - Array of verse ID numbers
 * @param language - Optional language code. If not provided, uses setLanguage value or defaults to 'en'
 * @returns Formatted scripture reference string
 */
export function generateReference(verseIds: number | number[], language?: LanguageCode): string;

/**
 * Sets the default language for scripture reference parsing
 * Stores the language preference in localStorage in browser environments
 * @param language - Language code (e.g., 'en', 'ko', 'de') or null for default
 */
export function setLanguage(language: LanguageCode): void;

/**
 * Detects scripture references in text and applies a callback function
 * @param content - Text content to search for scripture references
 * @param callback - Optional callback function to transform detected references
 * @param language - Optional language code. If not provided, uses setLanguage value or defaults to 'en'
 * @returns Text with scripture references processed by the callback
 */
export function detectReferences(content: string, callback?: DetectionCallback, language?: LanguageCode): string;

// Aliases for convenience
export { setLanguage as lang };
export { setLanguage as language };
export { setLanguage as setLang };

export { lookupReference as lookup };
export { lookupReference as parse };
export { lookupReference as read };
export { lookupReference as ref2VerseId };

export { generateReference as ref };
export { generateReference as gen };
export { generateReference as generate };
export { generateReference as verseId2Ref };

export { detectReferences as detect };
export { detectReferences as detectScriptureReferences };
export { detectReferences as detectRefs };
export { detectReferences as detectScriptures };
export { detectReferences as linkRefs };
