/**
 * Regression tests for reference-merge semantics (gap joiners) and
 * overlapping-abbreviation span integrity.
 *
 * Root causes covered:
 * 1. Joiner tokens were tested UNANCHORED against gaps, so any gap merely
 *    containing "and" or a comma merged adjacent references into one blob.
 * 2. Citation words (see, c.f.) are legitimate joiners when the gap consists
 *    of nothing else.
 * 3. findMatchIndexes clipped a longer match ("1 Ne 8.15-18") when a shorter
 *    overlapping candidate ("Ne 8.15-18" via Nehemiah) started inside it,
 *    leaving a mangled "1" span (full-document contamination bug).
 */
import { jest } from '@jest/globals';
import { gapCanMerge } from '../../src/scriptlib.mjs';
import { detectReferences } from '../../src/scriptures.mjs';

const EN_JOINERS = ["and", ";", ",", "&", "compare", "see also", "cf", "cited at", "see", "c.f."];
const bracket = (text) => `[${text}]`;

describe('gapCanMerge', () => {
  test('pure separators and whitespace merge', () => {
    expect(gapCanMerge('; ', EN_JOINERS)).toBe(true);
    expect(gapCanMerge(', ', EN_JOINERS)).toBe(true);
    expect(gapCanMerge(' ', EN_JOINERS)).toBe(true);
    expect(gapCanMerge(' and ', EN_JOINERS)).toBe(true);
  });

  test('citation words merge when gap is only citation material', () => {
    expect(gapCanMerge('; see ', EN_JOINERS)).toBe(true);
    expect(gapCanMerge(', see also ', EN_JOINERS)).toBe(true);
    expect(gapCanMerge('; cf. ', EN_JOINERS)).toBe(true);
    expect(gapCanMerge('; c.f. ', EN_JOINERS)).toBe(true);
    expect(gapCanMerge(' compare ', EN_JOINERS)).toBe(true);
  });

  test('gaps containing prose must NOT merge, even when they contain joiner words', () => {
    expect(gapCanMerge(').\nHe was vitally concerned for the welfare (see', EN_JOINERS)).toBe(false);
    expect(gapCanMerge(' under his command (see ', EN_JOINERS)).toBe(false); // "command" contains "and"
    expect(gapCanMerge(' is a series of visions (', EN_JOINERS)).toBe(false);
    expect(gapCanMerge('. Next sentence starts here with ', EN_JOINERS)).toBe(false);
  });

  test('accepts {patterns: [...]} shape (Korean data)', () => {
    expect(gapCanMerge('과 ', { patterns: ['과', '와', '및'] })).toBe(true);
    expect(gapCanMerge(' 다른 문장입니다 ', { patterns: ['과', '와', '및'] })).toBe(false);
  });

  test('legacy anchored regex form still works', () => {
    const legacy = ["^[;, &]*(and|see)*\\s*$"];
    expect(gapCanMerge('; and ', legacy)).toBe(true);
    expect(gapCanMerge(' prose text ', legacy)).toBe(false);
  });
});

describe('detectReferences merge behavior (integration)', () => {
  test('references in separate sentences stay separate', () => {
    const text = 'He heeded the prophet (see Alma 43:23-26).\nHe was concerned for those under his command (see Alma 44:1-20).';
    const out = detectReferences(text, bracket, { language: 'en', contextAware: false });
    expect(out).toContain('[Alma 43:23-26]');
    expect(out).toContain('[Alma 44:1-20]');
  });

  test('semicolon-separated groups still merge', () => {
    const out = detectReferences('Read Isa 45:22; Morm 3:18; Moro 10:24 today.', bracket, { language: 'en', contextAware: false });
    expect(out).toBe('Read [Isa 45:22; Morm 3:18; Moro 10:24] today.');
  });

  test('"; see" groups merge (citation joiner)', () => {
    const out = detectReferences('A phrase (Jn 10:17-18; see 2 Nephi 2:8) appears twice.', bracket, { language: 'en', contextAware: true });
    const links = out.match(/\[[^\]]+\]/g) || [];
    expect(links).toHaveLength(1);
    expect(links[0]).toContain('Jn 10:17-18');
    expect(links[0]).toContain('2 Nephi 2:8');
  });

  test('"1 Ne" keeps its full span in a document that also mentions "3 Ne" and "2 Ne"', () => {
    // Mirrors the real testDetect.en.txt line: period-delimited refs with an
    // en-dash range, in a document containing other "Ne"-family abbreviations.
    const text = 'God does not say this yet, but he will later; see Mt 7.23 (3 Ne 14.23); 2 Nephi 25.41; Lk 13.27. ' +
      'Nephi transforms God’s general summons at Isa 55.1 into a personal invitation to come to Christ (see 1 Ne 8.15–18n), ' +
      'in the process replacing wine and milk (note that Jacob had earlier quoted Isa 55.1–2 at 2 Ne 9.50–51).';
    const out = detectReferences(text, bracket, { language: 'en', contextAware: true });
    expect(out).toContain('[1 Ne 8.15–18]');
    expect(out).not.toContain('[1 ;');
    expect(out).not.toContain('Nehemiah');
  });
});

describe('context-aware path robustness', () => {
  test('does not crash (and does not warn) on content with implied refs but no explicit book', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const out = detectReferences('아들의 영광에 관한 시현(20~24절)이다.', bracket, { language: 'ko', contextAware: true });
      expect(typeof out).toBe('string');
      const fallbackWarnings = warnSpy.mock.calls.filter(args => String(args[0]).includes('falling back'));
      expect(fallbackWarnings).toHaveLength(0);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('merged citation strings are readable', () => {
  // The joiner merge used to concatenate spans with a bare ";", producing
  // "Jacob 4:10;2 Ne. 4:34" in every rendered link.
  test('merged spans are joined with "; ", not a bare ";"', () => {
    const out = detectReferences('Jacob 4:10; 2 Ne. 4:34; Prov. 12:15', bracket, { language: 'en' });
    expect(out).toBe('[Jacob 4:10; 2 Ne. 4:34; Prov. 12:15]');
  });

  // Clipping a match at the next match's start left the separator inside the
  // span ("D&C 58:2-4; 136:31;"), so the merge emitted ";;". Reproduced from
  // a real commentary body where the source text omits the space after ";".
  test('a citation list written without a space after ";" does not emit ";;"', () => {
    const out = detectReferences('D&C 58:2-4; 136:31;1 Cor. 10:13', bracket, { language: 'en' });
    expect(out).toBe('[D&C 58:2-4; 136:31; 1 Cor. 10:13]');
    expect(out).not.toContain(';;');
  });
});
