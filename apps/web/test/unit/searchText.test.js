import { describe, test, expect } from 'vitest';
import { stem } from '../../src/services/search/porterStemmer.js';
import { tokenize, queryStems, matchesAll, stemPrefix, queryTerms, matchesTerms } from '../../src/services/search/matcher.js';

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
  test('a quoted phrase matches its words in order, next to each other', () => {
    expect(queryTerms('"hand of the lord" upon')).toEqual([['hand', 'of', 'the', 'lord'], ['upon']]);
    expect(queryStems('"hand of the lord" upon')).toEqual(['hand', 'of', 'the', 'lord', 'upon']);
    const terms = queryTerms('"hand of the Lord upon him"');
    expect(matchesTerms('and the hand of the Lord was upon him.', terms)).toBe(false);
    expect(matchesTerms('And the hand of the Lord upon him was strong.', terms)).toBe(true);
    expect(matchesTerms('the hands of the Lord upon him', terms)).toBe(true);
    expect(matchesTerms('upon the hand of the Lord', queryTerms('"hand of the lord" upon'))).toBe(true);
  });
  test('an unclosed quote reads the rest as a phrase', () => {
    expect(queryTerms('"the third day')).toEqual([['the', 'third', 'dai']]);
  });
  test('stem prefixes cover the words that share the stem', () => {
    expect('happy'.startsWith(stemPrefix(stem('happiness')))).toBe(true);
    expect('charity'.startsWith(stemPrefix(stem('charities')))).toBe(true);
  });
});
