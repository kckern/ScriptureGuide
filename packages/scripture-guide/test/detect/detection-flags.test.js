/**
 * findReferences detection option flags. Defaults (abbreviations:true,
 * chapterOnly:true) detect everything the engine detects today; setting a flag
 * false filters that class of match out of the results.
 *
 * Refs in these fixtures are separated by prose (not "and"/","/";"), so each
 * stays a distinct record — joiner-separated refs intentionally merge into one
 * grouped citation and are covered elsewhere.
 */
import { findReferences, detectReferences } from '../../src/scriptures.mjs';

const texts = (results) => results.map(m => m.text);

describe('chapterOnly flag', () => {
  test('default keeps chapter-only refs alongside versed refs', () => {
    const out = findReferences('Read Genesis 2 in the morning. Then study John 3:16 tonight.', { contextAware: false });
    expect(texts(out)).toEqual(expect.arrayContaining(['Genesis 2', 'John 3:16']));
  });

  test('chapterOnly:false drops chapter-only, keeps versed', () => {
    const out = findReferences('Read Genesis 2 in the morning. Then study John 3:16 tonight.', { contextAware: false, chapterOnly: false });
    expect(texts(out)).toEqual(['John 3:16']);
  });

  test('chapterOnly:false keeps dotted verses and ranges', () => {
    const out = findReferences('Study 1 Nephi 8.15 closely. Later read Alma 32:21-23 also.', { contextAware: false, chapterOnly: false });
    expect(texts(out)).toEqual(['1 Nephi 8.15', 'Alma 32:21-23']);
  });
});

describe('abbreviations flag', () => {
  test('default keeps both abbreviated and full book names', () => {
    const out = findReferences('Mt 5:3 is short. Matthew 5:4 is long.', { contextAware: false });
    expect(texts(out)).toEqual(expect.arrayContaining(['Mt 5:3', 'Matthew 5:4']));
  });

  test('abbreviations:false drops abbreviated book names', () => {
    const out = findReferences('Mt 5:3 is short. Matthew 5:4 is long.', { contextAware: false, abbreviations: false });
    expect(texts(out)).toEqual(['Matthew 5:4']);
  });

  test('abbreviations:false keeps numbered full names (1 Nephi)', () => {
    const out = findReferences('Compare 1 Ne 3:7 here. Then 1 Nephi 3:7 there.', { contextAware: false, abbreviations: false });
    expect(texts(out)).toEqual(['1 Nephi 3:7']);
  });
});

describe('flags compose', () => {
  test('both flags false: only full-name versed refs survive', () => {
    const out = findReferences('Gen 1 opens. Genesis 2 follows. Jn 3:16 quotes. John 3:17 concludes.', { contextAware: false, abbreviations: false, chapterOnly: false });
    expect(texts(out)).toEqual(['John 3:17']);
  });
});

// detectReferences honours the same flags, with the same grouped exemption, on both paths.
describe.each([true, false])('detectReferences flags (contextAware:%s)', (contextAware) => {
  const detect = (text, opts = {}) => detectReferences(text, (t) => `[${t}]`, { contextAware, ...opts });

  test('defaults link chapter-only and abbreviated refs', () => {
    expect(detect('Read Luke 3 today. Then Lk 3:16 tonight.'))
      .toBe('Read [Luke 3] today. Then [Lk 3:16] tonight.');
  });

  test('undefined flags behave like the defaults', () => {
    expect(detect('Read Luke 3 today. Then Lk 3:16 tonight.', { chapterOnly: undefined, abbreviations: undefined }))
      .toBe('Read [Luke 3] today. Then [Lk 3:16] tonight.');
  });

  test('chapterOnly:false drops "Luke 3", keeps "Luke 3:16"', () => {
    expect(detect('Read Luke 3 today. Then Luke 3:16 tonight.', { chapterOnly: false }))
      .toBe('Read Luke 3 today. Then [Luke 3:16] tonight.');
  });

  test('abbreviations:false drops "Lk 3:16", keeps "Luke 3:16"', () => {
    expect(detect('Read Lk 3:16 today. Then Luke 3:16 tonight.', { abbreviations: false }))
      .toBe('Read Lk 3:16 today. Then [Luke 3:16] tonight.');
  });

  test('a grouped "Lk 3:16; 4:1" survives both flags', () => {
    expect(detect('Read Lk 3:16; 4:1 today.', { abbreviations: false, chapterOnly: false }))
      .toBe('Read [Lk 3:16; 4:1] today.');
  });
});
