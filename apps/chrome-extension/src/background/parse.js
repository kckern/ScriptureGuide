// Parsing for content scripts, run in the background service worker so it never blocks a
// page. One findReferences call per chunk; a chunk that throws yields no matches.

import { findReferences, setLanguage, setCanon } from 'scripture-guide';

export function parseChunks({ chunks, options = {} }) {
  try {
    if (options.language) setLanguage(options.language);
    if (options.canon) setCanon(options.canon);
  } catch (e) { /* parser defaults are fine */ }
  const detect = {
    language: options.language,
    contextAware: options.contextAware,
    enableImpliedBooks: options.enableImpliedBooks,
    abbreviations: options.abbreviations,
    chapterOnly: options.chapterOnly,
    wholeBooks: options.wholeBooks
  };
  const results = (chunks || []).map((text) => {
    try {
      return typeof text === 'string' ? findReferences(text, detect) || [] : [];
    } catch (e) {
      return [];
    }
  });
  return { results };
}
