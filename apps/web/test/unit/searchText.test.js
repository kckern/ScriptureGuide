import { describe, test, expect } from 'vitest';
import { stem } from '../../src/services/search/porterStemmer.js';
import { tokenize, queryStems, matchesAll, stemPrefix } from '../../src/services/search/matcher.js';
import { flattenText, plainText, arrayText, verseLines } from '../../src/services/text/flattenText.js';

describe('porter stemmer', () => {
  test.each([
    ['caresses', 'caress'], ['ponies', 'poni'], ['cats', 'cat'], ['agreed', 'agre'], ['plastered', 'plaster'],
    ['motoring', 'motor'], ['hopping', 'hop'], ['hoping', 'hope'], ['happy', 'happi'], ['relational', 'relat'],
    ['hopeful', 'hope'], ['goodness', 'good'], ['generalizations', 'gener'], ['adoption', 'adopt'],
    ['controlling', 'control'], ['charity', 'chariti'], ['charities', 'chariti'], ['faith', 'faith'],
    ['faithful', 'faith'], ['faithfulness', 'faith'], ['faithfully', 'faith'], ['faithless', 'faithless'],
  ])('%s → %s', (word, expected) => {
    expect(stem(word)).toBe(expected);
  });
  test('leaves words of two letters alone', () => {
    expect(stem('is')).toBe('is');
  });
});

describe('Sphinx-style matcher', () => {
  test('tokenizes on the index charset: punctuation and curly quotes separate words', () => {
    expect(tokenize('§¶｟The｠ Lord’s house, faith_x 12')).toEqual(['the', 'lord', 's', 'house', 'faith_x', '12']);
  });
  test('requires every query stem (implicit AND)', () => {
    const verse = 'And now abideth faith, hope, charity, these three; but the greatest of these is charity.';
    expect(matchesAll(verse, queryStems('faith hope charity'))).toBe(true);
    expect(matchesAll(verse, queryStems('faith love'))).toBe(false);
  });
  test('matches other forms of the word through the stem', () => {
    expect(matchesAll('Moreover it is required in stewards, that a man be found faithful.', queryStems('faith'))).toBe(true);
    expect(matchesAll('they were unfaithful', queryStems('faith'))).toBe(false);
  });
  test('stem prefixes cover the words that share the stem', () => {
    expect('happy'.startsWith(stemPrefix(stem('happiness')))).toBe(true);
    expect('charity'.startsWith(stemPrefix(stem('charities')))).toBe(true);
  });
});

describe('verse text flattening', () => {
  test('flattenText drops markup characters and keeps letters and punctuation', () => {
    expect(flattenText('｟The｠ word_ of｢12｣ God|said')).toBe('The word of God said');
    expect(flattenText('end.Next')).toBe('end. Next');
  });
  test('splits lines at paragraph markers and line breaks', () => {
    expect(verseLines('§¶In the beginning/God created¶▼the heaven')).toEqual(['In the beginning', 'God created', 'the heaven']);
  });
  test('arrayText prefixes each line with a space, as renderArray does', () => {
    expect(arrayText('§¶｟The｠ word that Isaiah saw.')).toBe(' The word that Isaiah saw.');
    expect(arrayText('¶one/two')).toBe(' one two');
  });
  test('plainText joins lines with single spaces and trims', () => {
    expect(plainText('§¶In the beginning/ God created  the heaven.')).toBe('In the beginning God created the heaven.');
  });
});
