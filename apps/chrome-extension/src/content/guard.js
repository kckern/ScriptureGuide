// False-positive guard between the parser and the page. The parser reads "Is 4,300 Years Old"
// as Isaiah 4, so every match is vetted against the text around it before it becomes a link.
// Matches without numeric offsets pass through untouched.

// Abbreviations that are also ordinary English words. They only link with a chapter:verse form.
const COMMON_ABBREVIATIONS = new Set(['is', 'am', 'so', 'he', 'ex', 'ho', 're', 'jo']);

// Chapter-only matches followed by a unit are quantities: "Mark 5 times", "Job 3 people".
const UNIT_AFTER = new RegExp('^\\s*(?:%|(?:years?|yrs?|people|persons?|times|percent|million|billion|thousand|' +
  'km|miles?|days?|months?|weeks?|hours?|minutes?|seconds?|dollars?|feet|ft|kg|lbs?|pounds?|' +
  'items?|points?|votes?|children|kids|members|users|views|likes|shares|comments)\\b)', 'i');

const VERSE_SEPARATOR = /\d\s*[:.]\s*\d/;

export function acceptMatch(text, m) {
  if (!m || typeof m.start !== 'number' || typeof m.end !== 'number') return true;
  const span = text.slice(m.start, m.end);
  const after = text.slice(m.end);
  const hasVerse = VERSE_SEPARATOR.test(span);

  // A number written with a thousands group ("4,300") is a quantity, not chapter and verse.
  // A comma after a verse ("Ps 119:105,160") is a legitimate verse list.
  const grouped = /\d,\d{3}(?!\d)/.exec(span + after.slice(0, 4));
  if (grouped && !/[:.]/.test((span + after).slice(0, grouped.index))) return false;

  // Common-word abbreviations ("Is", "Am", "So") need a verse.
  const book = /^\s*(?:\d\s*)?([A-Za-z]+)/.exec(span);
  if (book && COMMON_ABBREVIATIONS.has(book[1].toLowerCase()) && !hasVerse) return false;

  // Chapter-only followed by a unit word.
  if (!hasVerse && UNIT_AFTER.test(after)) return false;

  return true;
}

export function guardMatches(text, matches) {
  return (matches || []).filter((m) => acceptMatch(text, m));
}
