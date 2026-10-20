/**
 * findReferences detection option flags. Defaults (abbreviations:true,
 * chapterOnly:true) detect everything the engine detects today; setting a flag
 * false filters that class of match out of the results.
 *
 * Refs in these fixtures are separated by prose (not "and"/","/";"), so each
 * stays a distinct record — joiner-separated refs intentionally merge into one
 * grouped citation and are covered elsewhere.
 */
import { findReferences } from '../../src/scriptures.mjs';

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
