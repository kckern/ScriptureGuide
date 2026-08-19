/**
 * Properties that must hold for EVERY detectReferences result, on any input.
 *
 * Why this exists: a bare-semicolon merge bug ("Jn 10.17-18;2 Nephi 2.8") and a
 * span-clipping bug that emitted ";;" both shipped while the suite was green.
 * The suite did not merely miss them -- the snapshot asserted them, a
 * hand-written expectation asserted them, and a prose fixture had been pasted in
 * from the buggy pipeline's own output, so input and output looked alike.
 *
 * Value-equality tests cannot express "the output is well-formed". These can.
 * They are driven over every fixture and prose sample, so no corpus can freeze a
 * malformation again: a value can be wrong-but-blessed, a property cannot.
 *
 * Merging is lossy BY DESIGN -- "(Jn 10.17-18; see 2 Nephi 2.8n)" renders as
 * "([Jn 10.17-18; 2 Nephi 2.8]n)", dropping "see" and rewriting " and " to "; ".
 * So the naive `strip(output) === input` is false on purpose, and the invariants
 * below are calibrated to the normalizing contract instead.
 */

// Private-use codepoint: cannot occur in scripture prose, so splitting on it
// cleanly separates rendered spans from the text around them.
const SENTINEL = '';

// A rendered span must look like a citation list: trimmed, single "; " or ", "
// separators, no doubled punctuation, no trailing separator.
const GRAMMAR_VIOLATIONS = [
  [/;;/, 'doubled semicolon'],
  [/,,/, 'doubled comma'],
  [/ {2}/, 'doubled space'],
  [/^\s|\s$/, 'untrimmed'],
  [/;\S/, 'semicolon not followed by a space'],
  // A comma between digits is a delimiter, not a list separator: verse lists
  // ("Isa 1:1,2") and the European chapter,verse style ("Matt 19,16-22") are
  // both legitimate. Only a comma butted against a non-digit is malformed.
  [/,(?=[^\s\d])/, 'comma not followed by a space'],
  [/[;,]$/, 'trailing separator'],
  [/^[;,\s]/, 'leading separator'],
];

// Context-derived spans ("vv. 20-24", "verse 18") legitimately cannot be parsed
// standalone -- they inherit their book and chapter from earlier prose. They are
// the ONLY spans allowed to fail the re-parse check.
const IMPLIED_REFERENCE = /^(?:vv?|vs|verses?|chapters?|ch)\b|^\d+(?:[:.]\d+)?(?:\s*[-–—]\s*\d+)?$/i;

/**
 * Run detectReferences and collect each rendered span with the ids it was given.
 */
function collectSpans(detectReferences, input, options) {
  const spans = [];
  const output = detectReferences(
    input,
    (text, verseIds) => {
      spans.push({ text, verseIds: verseIds || [] });
      return SENTINEL + text + SENTINEL;
    },
    options
  );
  return { output, spans };
}

/**
 * Assert the three detect invariants against one input.
 *
 * @param {object} deps - { detectReferences, lookupReference }
 * @param {string} input - Content to run detection over
 * @param {object} options - detectReferences options (language, contextAware, ...)
 * @returns {{spans: Array, output: string}} for callers that want to assert more
 */
export function assertDetectInvariants(deps, input, options) {
  const { detectReferences, lookupReference } = deps;
  const { output, spans } = collectSpans(detectReferences, input, options);
  const where = `[${options.language}, contextAware:${options.contextAware}]`;

  const pieces = output.split(SENTINEL);
  const outside = pieces.filter((_, i) => i % 2 === 0);
  const rendered = pieces.filter((_, i) => i % 2 === 1);

  // I1 - Outside-text preservation. Every non-reference piece must occur in the
  // INPUT, in order, with a monotonically advancing cursor. This is what catches
  // span-arithmetic errors: a clipped span leaks its separator into the
  // surrounding text, and a miscomputed offset duplicates or eats characters.
  let cursor = 0;
  for (const piece of outside) {
    if (piece === '') continue;
    const at = input.indexOf(piece, cursor);
    if (at === -1) {
      throw new Error(
        `${where} non-reference text was altered by detection.\n` +
        `  Text not found in input at/after offset ${cursor}:\n    ${JSON.stringify(piece.slice(0, 120))}`
      );
    }
    cursor = at + piece.length;
  }

  // I2 - Strict span grammar. A merged citation must read as a citation.
  for (const text of rendered) {
    for (const [pattern, label] of GRAMMAR_VIOLATIONS) {
      if (pattern.test(text)) {
        throw new Error(`${where} malformed citation span (${label}): ${JSON.stringify(text)}`);
      }
    }
  }

  // I3 - Round-trip, two-way classified. A self-contained span must re-parse to
  // exactly the ids it was rendered with; anything that does not re-parse must
  // at least LOOK like a context-derived reference. Garbage such as "1 ;"
  // satisfies neither branch, which is precisely the contamination bug.
  for (const { text, verseIds } of spans) {
    let reparsed = [];
    try {
      reparsed = (lookupReference(text, options.language) || {}).verse_ids || [];
    } catch (err) {
      throw new Error(`${where} span threw on re-parse: ${JSON.stringify(text)} (${err.message})`);
    }
    if (reparsed.length > 0) {
      if (JSON.stringify(reparsed) !== JSON.stringify(verseIds)) {
        throw new Error(
          `${where} span does not round-trip: ${JSON.stringify(text)}\n` +
          `  rendered with ${verseIds.length} ids, re-parses to ${reparsed.length}`
        );
      }
    } else if (!IMPLIED_REFERENCE.test(text.trim())) {
      throw new Error(
        `${where} span neither re-parses nor looks like a context-derived ` +
        `reference: ${JSON.stringify(text)}`
      );
    }
  }

  return { spans, output };
}
