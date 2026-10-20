/**
 * Detection hardening against the real scriptures.byu.edu STPJS corpus.
 *
 * Exit criteria (validated here + by adversarial agents over the full prose):
 *  T1 CORRECTNESS: newline/extra whitespace between book and chapter must not
 *     orphan the book or mislink to a neighboring book's context.
 *  T2 VERSE CONTINUATION: "C:V and V2" / "C:V, V2 and V3" resolve to the full
 *     verse span.
 *  T3 SPELLED-OUT: "Nth chapter of [the book of] BOOK" resolves to BOOK N.
 *  Guard: no false positives on ordinary numeric prose.
 */
import { findReferences, lookupReference } from '../../src/scriptures.mjs';

const find = (s, o = {}) => findReferences(s, { contextAware: true, ...o });
const refset = (s, o) => find(s, o).map((m) => m.ref);
// verse_ids for a canonical reference, for equivalence assertions
const ids = (ref) => lookupReference(ref).verse_ids;
// All verse_ids detected in a string (matches may group several refs together).
const allIds = (s, o) => find(s, o).flatMap((m) => m.verse_ids);
const covers = (s, ref, o) => { const got = new Set(allIds(s, o)); return ids(ref).every((v) => got.has(v)); };

describe('T1: whitespace / newline between book and chapter', () => {
  test('newline does not orphan the book (Ezekiel stays Ezekiel, not Psalms)', () => {
    const s = 'Psalms 1:5; Ezekiel\n   34:11, 12 and 13.';
    // Ezekiel 34:11-13 must be among the detected verses...
    expect(covers(s, 'Ezekiel 34:11-13')).toBe(true);
    // ...and it must NOT have been mislinked to Psalm 34.
    const got = new Set(allIds(s));
    expect(ids('Psalms 34:11-13').some((v) => got.has(v))).toBe(false);
    expect(find(s).some((m) => /Psalms 34/i.test(m.ref))).toBe(false);
  });

  test('multiple spaces between book and chapter', () => {
    expect(refset('See Matthew   5:3 today.')).toContain('Matthew 5:3');
  });
});

describe('T2: verse continuation with "and" / commas', () => {
  test('"C:V and V2" -> range', () => {
    const s = 'Christ said to His disciples (Mark 16:17 and 18).';
    const m = find(s).find((x) => /Mark 16/i.test(x.ref));
    expect(m.verse_ids).toEqual(ids('Mark 16:17-18'));
  });
  test('"C:V, V2 and V3" -> full span', () => {
    const m = find('See Romans 11:25, 26 and 27 here.').find((x) => /Romans 11/i.test(x.ref));
    expect(m.verse_ids).toEqual(ids('Romans 11:25-27'));
  });
  test('grouped list keeps each book correct', () => {
    const s = 'See Joel 2:32; Isaiah 26:20 and 21; Jeremiah 31:12.';
    expect(covers(s, 'Joel 2:32')).toBe(true);
    expect(covers(s, 'Isaiah 26:20-21')).toBe(true);
    expect(covers(s, 'Jeremiah 31:12')).toBe(true);
  });
});

describe('T3: spelled-out "Nth chapter of BOOK"', () => {
  test('ordinal chapter of a named book', () => {
    const m = find('remarks on the 13th chapter of First Corinthians tonight').find(Boolean);
    expect(m).toBeDefined();
    expect(m.verse_ids).toEqual(ids('1 Corinthians 13'));
  });
  test('"Nth chapter of BOOK" (Romans)', () => {
    const m = find('he read the 9th chapter of Romans aloud').find(Boolean);
    expect(m.verse_ids).toEqual(ids('Romans 9'));
  });
  test('"the book of" wording', () => {
    const m = find('found in the 22nd chapter of the book of Matthew').find(Boolean);
    expect(m.verse_ids).toEqual(ids('Matthew 22'));
  });
});

describe('T3b: word-ordinal chapters (adversarial findings)', () => {
  test('"the second chapter of Joel"', () => {
    expect(find('the Prophet read the second chapter of Joel and remarked').find(Boolean).verse_ids)
      .toEqual(ids('Joel 2'));
  });
  test('"the fifth chapter of Matthew"', () => {
    expect(find('quoting from the fifth chapter of Matthew, ye are the light').find(Boolean).verse_ids)
      .toEqual(ids('Matthew 5'));
  });
  test('"the fifteenth chapter of First Corinthians"', () => {
    expect(find('from the fifteenth chapter of First Corinthians here').find(Boolean).verse_ids)
      .toEqual(ids('1 Corinthians 15'));
  });
  test('"Nth verse of the Mth chapter of BOOK"', () => {
    // "the fifteenth verse of the seventh chapter of Revelation" -> Revelation 7:15
    const m = find('the fifteenth verse of the seventh chapter of Revelation').find(Boolean);
    expect(m.verse_ids).toEqual(ids('Revelation 7:15'));
  });
});

describe('T4: parenthetical and "Sec." forms', () => {
  test('paren between book and verse: "Philippians (3:20, 21)"', () => {
    expect(covers('epistle to the Philippians (3:20, 21) he says', 'Philippians 3:20-21')).toBe(true);
  });
  test('"Doctrine and Covenants, Sec. 93:29"', () => {
    expect(covers('explained in the Doctrine and Covenants, Sec. 93:29 that man', 'Doctrine and Covenants 93:29')).toBe(true);
  });
});

describe('Guard: no false positives on ordinary prose', () => {
  test('plain numbers and dates are not linked', () => {
    expect(find('There were 3 chapters and 16 verses written in 1830.')).toEqual([]);
    expect(find('He was 26 and she was 21 in the year 1844.')).toEqual([]);
  });
  test('"chapter" with no book/number context does not link', () => {
    expect(find('This chapter of my life is closing.')).toEqual([]);
  });
});

describe('Guard: adversarial-review false positives', () => {
  test('ReDoS — book followed by a long whitespace run resolves fast and does not match', () => {
    const s = 'Genesis' + ' '.repeat(60) + 'was the beginning of all things here.';
    const t0 = Date.now();
    const out = find(s);
    expect(Date.now() - t0).toBeLessThan(500); // would be many seconds with the exponential regex
    expect(out).toEqual([]);
  });
  test('book name ending a sentence does not bind to the next line/list number', () => {
    expect(find('This story is told in Genesis.\n\n2. The second point follows.')
      .some((m) => /Genesis 2/i.test(m.ref))).toBe(false);
    expect(find('That story is in Genesis. Section 2 of this essay explains why.')
      .some((m) => /Genesis 2/i.test(m.ref))).toBe(false);
  });
  test('"Amos 5. Section 3" does not fabricate Amos 5:3', () => {
    const out = find('He quoted Amos 5. Section 3 covers the judgment theme.');
    expect(out.some((m) => /Amos 5:3/.test(m.ref))).toBe(false);
  });
  test('spelled-out chapter of a personal name / possessive is rejected', () => {
    expect(find('the fifth chapter of Matthew Henry’s commentary on the gospel')).toEqual([]);
    expect(find('the third chapter of James Brown’s autobiography')).toEqual([]);
  });
  test('spelled-out chapter of a lowercase word is rejected (i-flag guard)', () => {
    expect(find('the second chapter of job hunting is networking')).toEqual([]);
  });
});

describe('T5: hyphenated Joseph Smith abbreviations', () => {
  test('"JS-H 1:44" resolves to Joseph Smith—History', () => {
    expect(covers('See JS-H 1:44 tonight.', 'Joseph Smith—History 1:44')).toBe(true);
  });
  test('em-dash and long forms', () => {
    expect(covers('JS—H 1:44', 'Joseph Smith—History 1:44')).toBe(true);
    expect(covers('js-hist 1:44', 'Joseph Smith—History 1:44')).toBe(true);
  });
  test('range form "JS-H 1:50-52"', () => {
    expect(covers('quoted JS-H 1:50-52 here', 'Joseph Smith—History 1:50-52')).toBe(true);
  });
  test('does not swallow a following word (no false positive on "js-heavy")', () => {
    expect(find('this is a js-heavy framework').length).toBe(0);
  });
});
