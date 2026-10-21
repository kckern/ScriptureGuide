import { describe, test, expect } from 'vitest';
import { cleanReference, numericVerseIds, strToTitle, REGEX_TABLES } from '../../src/domain/rules/cleanReference.js';

// Expected values are what the PHP site showed for these references (block headings, meta "orig").
describe('cleanReference (scriptutil::cleanReference)', () => {
  test.each([
    ['john.3.16', 'John 3:16'],
    ['js-h.1.17', 'Joseph Smith History 1:17'],
    ['blog', 'Blog'],
    ['plains-of-nephi', 'Plains-of-Nephi'],
    ['run-task', 'Run-task'],
    ['plugins; demo; my_file.php', 'Plugins; Demo; My_file Php'],
    ['abc.php71', 'Abc Php 71'],
    ['north; 200', 'North; 200'],
    ['widgets; v1; items', 'Widgets:1; Items'],
    ['docs; v2; search', 'Docs:2; Search'],
    ['v3; ', ':3;'],
    ['1903-settlers', '1903 Settlers'],
    ['1902-chapter-6', '1902 Chapter 6'],
    ['nephi-3-travels', '1 Nephi 3-travels'],
    ['nephi-3-and-lehi-4', '1 Nephi 3-and-lehi 4'],
    ['corianton7', '1 Corianton 7'],
    ['corianton; 12', '1 Corianton; 12'],
    ['0815qx3plmnbvcxz42', '0815 Qx 3 Plmnbvcxz 42'],
    ['3gb', '3 Gb'],
    ['feed2.xml', 'Feed 2 Xml'],
    ['site1ab02345c67890d.html', 'Site 1 Ab 2345 C 67890 D Html'],
    ['key_rs4096', 'Key_rs 4096'],
    ['ab7cd5by', 'Ab 7 Cd 5 by'],
    ['rest-api; ', 'Rest-api;'],
    ['1.nephi.3:7–8,.5:2,.7:1', '1 Nephi 3:7-8, 5:2, 7:1'],
  ])('%j → %j', (ref, expected) => {
    expect(cleanReference(ref)).toBe(expected);
  });

  test('"-h" loses its dash: PHP\'s "${1} H" interpolated an undefined variable', () => {
    expect(cleanReference('x-hymn')).toBe('X Hymn');
  });

  test('an empty reference is false (PHP empty())', () => {
    expect(cleanReference('')).toBe(false);
    expect(cleanReference('0')).toBe(false);
    expect(cleanReference(null)).toBe(false);
  });
});

describe('numericVerseIds (the is_numeric branch)', () => {
  test('verse ids, ranges and lists', () => {
    expect(numericVerseIds('26137')).toEqual([26137]);
    expect(numericVerseIds('1-3;7')).toEqual([1, 2, 3, 7]);
    expect(numericVerseIds('5-3')).toEqual([5, 4, 3]);
  });

  test('two numbers with a space read as a decimal id, which matches no verse', () => {
    expect(numericVerseIds('1901 07')).toEqual([1901.07]);
  });

  test('not numeric: null', () => {
    expect(numericVerseIds('john 3')).toBeNull();
    expect(numericVerseIds('')).toBeNull();
  });

  test('a huge range reads as no verses', () => {
    expect(numericVerseIds('1-99999999')).toEqual([]);
  });
});

describe('strToTitle (utils::strtotitle)', () => {
  test('small words stay lower case except the first', () => {
    expect(strToTitle('of mice and men')).toBe('Of Mice and Men');
  });
  test('Jst and Tsp are upper-cased anywhere', () => {
    expect(strToTitle('jst genesis')).toBe('JST Genesis');
  });
});

describe('cleanReference: cost of adversarial input', () => {
  const time = fn => { const t = performance.now(); fn(); return performance.now() - t; };
  // Fragments that drive the worst backtracking in the regex tables (found by an audit of every
  // pattern): "3ne " (cubic: \b3.*ne...*?acts), "the " (Law of the Lord), "s " (.*?moses), ...
  const FRAGMENTS = ['3ne ', '3ne 3ne ', 'the the ', 's ', 'of a ', ',', ',,', '0', '\t. ', ' ', 'jst ', 'al-', 'w o '];

  test('a reference longer than 500 characters is not cleaned (PHP hit pcre.backtrack_limit): false, at once', () => {
    const long = '3ne '.repeat(2000);
    let out;
    expect(time(() => { out = cleanReference(long); })).toBeLessThan(50);
    expect(out).toBe(false);
    expect(cleanReference('a'.repeat(501))).toBe(false);
    expect(cleanReference('a'.repeat(500))).toBe('A'.padEnd(500, 'a'));
  });

  test.each(FRAGMENTS)('500 characters of %j clean in well under a second', frag => {
    const s = frag.repeat(Math.ceil(500 / frag.length)).slice(0, 500);
    expect(time(() => cleanReference(s))).toBeLessThan(100);
  });

  test('with "acts" or "moses" present the guarded patterns still apply', () => {
    expect(cleanReference('3 nephites acts 2')).toBe('Acts of the Three Nephites 2');
    expect(cleanReference('sealed book of moses 1')).toBe('Sealed Book of Moses 1');
  });
});

describe('regex tables: no pattern backtracks badly on 500 characters', () => {
  const FRAGMENTS = ['3ne ', '3ne 3ne ', 'the the ', 's ', 'of a ', ',', ',,', '0', '\t. ', ' ', 'jst ', 'al-', 'w o ', 'd c a ', 'surah a ', 'qur ', 'l o '];
  test.each(Object.entries(REGEX_TABLES).flatMap(([t, list]) => list.map(([re], i) => [`${t} ${i}`, re])))('%s', (name, re) => {
    for (const frag of FRAGMENTS) {
      const s = frag.repeat(Math.ceil(500 / frag.length)).slice(0, 500);
      const t = performance.now();
      s.replace(re, 'X');
      expect(performance.now() - t).toBeLessThan(25);
    }
  });
});
