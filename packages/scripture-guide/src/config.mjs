/**
 * Configuration constants for scripture-guide
 */

// Safety limits
export const MAX_RANGE_SIZE = 1000;
export const MAX_CHAPTER = 200;
export const MAX_VERSE = 200;
export const MAX_QUERY_LENGTH = 500;

// Language fallback order
export const LANGUAGE_FALLBACK = ['en', 'es', 'fr', 'de', 'ko', 'ja', 'zh'];

// Default settings (canon value comes from registered canons)
export const DEFAULTS = {
  language: 'en',
  canon: 'lds',
  contextAware: false
};
