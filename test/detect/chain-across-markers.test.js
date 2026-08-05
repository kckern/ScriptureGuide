/**
 * chainAcrossMarkers option.
 *
 * Prose markers ("see also", "cf.", "cited at", "compare") are configured as
 * joiners so lookupReference folds "A; see also B" into one verse set. The
 * detectors linkify prose, so merging across a marker swallows the connective
 * words out of the rendered output. chainAcrossMarkers: false restricts the
 * joiner list to structural separators (";", ",", "&", "and") for detection
 * only. Default stays true for backward compatibility.
 */
import { detectReferences, findReferences } from '../../src/scriptures.mjs';

const link = (ref) => `<a>${ref}</a>`;
const SPLIT = { chainAcrossMarkers: false };

describe('chainAcrossMarkers default (true)', () => {
  test('merges across a prose marker, as before', () => {
    expect(detectReferences('1 Nephi 2:13; see also Helaman 8:21.', link))
      .toBe('<a>1 Nephi 2:13;Helaman 8:21</a>.');
  });

  test('explicitly passing true matches the default', () => {
    const text = 'Mosiah 3:19; cf. Alma 7:11';
    expect(detectReferences(text, link, { chainAcrossMarkers: true }))
      .toBe(detectReferences(text, link));
  });
});

describe('chainAcrossMarkers: false splits at prose markers', () => {
  test('"see also" is preserved between two links', () => {
    expect(detectReferences('1 Nephi 2:13; see also Helaman 8:21.', link, SPLIT))
      .toBe('<a>1 Nephi 2:13</a>; see also <a>Helaman 8:21</a>.');
  });

  test('"cited at" is preserved between two links', () => {
    expect(detectReferences('Alma 32:21, cited at Ether 12:6', link, SPLIT))
      .toBe('<a>Alma 32:21</a>, cited at <a>Ether 12:6</a>');
  });

  test('"cf." is preserved between two links', () => {
    expect(detectReferences('Mosiah 3:19; cf. Alma 7:11', link, SPLIT))
      .toBe('<a>Mosiah 3:19</a>; cf. <a>Alma 7:11</a>');
  });

  test('works in the non-context-aware path too', () => {
    const out = detectReferences('1 Nephi 2:13; see also Helaman 8:21.', link,
      { ...SPLIT, contextAware: false });
    expect(out).toContain('see also');
    expect(out).toContain('<a>1 Nephi 2:13</a>');
    expect(out).toContain('<a>Helaman 8:21</a>');
  });
});

describe('structural joiners still merge when chainAcrossMarkers is false', () => {
  test('"and" between verses stays one link', () => {
    expect(detectReferences('Alma 5:14 and 15', link, SPLIT))
      .toBe('<a>Alma 5:14 and 15</a>');
  });

  test('comma and semicolon lists stay one link', () => {
    expect(detectReferences('1 Ne. 3:7, 8; Mosiah 3:19', link, SPLIT))
      .toBe('<a>1 Ne. 3:7, 8;Mosiah 3:19</a>');
  });
});

describe('clause-initial markers are unaffected', () => {
  test.each([true, false])('chainAcrossMarkers: %s', (chainAcrossMarkers) => {
    expect(detectReferences('See also Alma 32:21', link, { chainAcrossMarkers }))
      .toBe('See also <a>Alma 32:21</a>');
  });
});

describe('book carry-over does not regress', () => {
  test('bare "6:2" after a marker still inherits Alma from context', () => {
    expect(detectReferences('Alma 5:14; see also 6:2', link, SPLIT))
      .toBe('<a>Alma 5:14</a>; see also <a>6:2</a>');

    const records = findReferences('Alma 5:14; see also 6:2', SPLIT);
    expect(records.map(r => r.ref)).toEqual(['Alma 5:14', 'Alma 6:2']);
  });
});

describe('findReferences', () => {
  test('returns more records when chainAcrossMarkers is false', () => {
    const text = '1 Nephi 2:13; see also Helaman 8:21.';
    const merged = findReferences(text);
    const split = findReferences(text, SPLIT);

    expect(merged).toHaveLength(1);
    expect(split.length).toBeGreaterThan(merged.length);
    expect(split.map(r => r.ref)).toEqual(['1 Nephi 2:13', 'Helaman 8:21']);
  });

  test('offsets still slice back to the matched text, marker excluded', () => {
    const text = '1 Nephi 2:13; see also Helaman 8:21.';
    for (const r of findReferences(text, SPLIT)) {
      expect(text.slice(r.start, r.end)).toBe(r.text);
      expect(r.text).not.toMatch(/see also/i);
    }
  });
});

describe('shared config is not mutated', () => {
  test('a chainAcrossMarkers: false call does not affect later default calls', () => {
    const text = '1 Nephi 2:13; see also Helaman 8:21.';
    const before = detectReferences(text, link);
    detectReferences(text, link, SPLIT);
    findReferences(text, SPLIT);
    expect(detectReferences(text, link)).toBe(before);
  });
});
