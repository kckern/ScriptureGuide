import { describe, test, expect } from 'vitest';
import { snowballStem as stem, SNOWBALL } from '../../src/services/search/snowballEnglish.js';
import { tokenize, queryStems, matchesAll, stemPrefix, queryTerms, matchesTerms } from '../../src/services/search/matcher.js';

// The stemmer is written from Snowball's English (Porter2) description; every expected stem here
// was printed by Sphinx's stem_en, compiled and run outside the repo, which agrees with
// snowballStem on all 288,696 ASCII words of the full database and a dictionary.
describe('Sphinx stem_en', () => {
  test.each([
    ['caresses', 'caress'], ['ponies', 'poni'], ['cats', 'cat'], ['agreed', 'agre'], ['plastered', 'plaster'],
    ['motoring', 'motor'], ['hopping', 'hop'], ['hoping', 'hope'], ['happy', 'happi'], ['relational', 'relat'],
    ['hopeful', 'hope'], ['goodness', 'good'], ['generalizations', 'general'], ['adoption', 'adopt'],
    ['controlling', 'control'], ['charity', 'chariti'], ['charities', 'chariti'], ['faith', 'faith'],
    ['faithful', 'faith'], ['faithfulness', 'faith'], ['faithfully', 'faith'], ['faithless', 'faithless'],
  ])('%s → %s (as Porter)', (word, expected) => {
    expect(stem(word)).toBe(expected);
  });
  // Step 2 deletes -li after c d e g h k m n r t, with the stem's R1 at least two letters long
  test.each([
    ['godly', 'god'], ['earthly', 'earth'], ['heavenly', 'heaven'], ['godliness', 'godli'],
    ['lovingly', 'love'], ['exceedingly', 'exceed'],
  ])('-ly: %s → %s', (word, expected) => {
    expect(stem(word)).toBe(expected);
  });
  test.each([
    ['holy', 'holi'], ['fly', 'fli'], ['reply', 'repli'], ['family', 'famili'], ['daily', 'daili'],
  ])('-ly kept: %s → %s', (word, expected) => {
    expect(stem(word)).toBe(expected);
  });
  test.each([
    ['only', 'onli'], ['early', 'earli'], ['ugly', 'ugli'], ['idly', 'idl'], ['gently', 'gentl'], ['singly', 'singl'],
    ['was', 'wa'], ['his', 'hi'], ['dying', 'die'], ['lying', 'lie'], ['tying', 'tie'], ['skies', 'sky'],
    ['sky', 'sky'], ['news', 'news'], ['proceed', 'proceed'], ['aging', 'age'], ['using', 'use'],
  ])('Sphinx exceptions and short stems: %s → %s', (word, expected) => {
    expect(stem(word)).toBe(expected);
  });
  test('leaves words of two letters alone', () => {
    expect(stem('is')).toBe('is');
  });
});

describe('where Sphinx stem_en differs from the Snowball description', () => {
  // [word, Sphinx stem, Snowball (pre-3.0) stem]
  test.each([
    ['gas', 'ga', 'gas'], ['this', 'thi', 'this'],                        // any final s goes
    ['demagogy', 'demagog', 'demagogi'],                                 // -ogi → -og after any letter
    ['combative', 'comb', 'combat'],                                      // -ative goes in R1
    ['anticonventionalism', 'anticonvention', 'anticonvent'],            // no Step 3 -tional
    ['arsenal', 'arsen', 'arsenal'], ['communal', 'commun', 'communal'],  // only gener- sets R1
    ['aquarelle', 'aquarel', 'aquarell'],                                // ll undoubled after e goes
    ['atlas', 'atla', 'atlas'], ['bias', 'bia', 'bias'],                  // not exceptions
    ['exceeds', 'exce', 'exceed'], ['herring', 'her', 'herring'],        // fewer invariant forms
    ['conditionally', 'condit', 'condit'], ['relationally', 'relat', 'relat'], ['nationally', 'nation', 'nation'],
  ])('%s → %s (Snowball: %s)', (word, sphinx, snowball) => {
    expect(stem(word)).toBe(sphinx);
    expect(stem(word, SNOWBALL)).toBe(snowball);
  });
  test('-ied/-ies: -ie only after exactly one letter', () => {
    expect([stem('ties'), stem('cries'), stem('ies')]).toEqual(['tie', 'cri', 'i']);
    expect(stem('ies', SNOWBALL)).toBe('ie');
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
    expect(queryTerms('"the third day')).toEqual([['the', 'third', 'day']]);
  });
  test('stem prefixes cover the words that share the stem', () => {
    expect('happy'.startsWith(stemPrefix(stem('happiness')))).toBe(true);
    expect('charity'.startsWith(stemPrefix(stem('charities')))).toBe(true);
  });
  test('short words ending in y keep a prefix of their words ("eyed" → "eye", "cried" → "cri")', () => {
    for (const w of ['day', 'may', 'say', 'joy', 'eyed', 'cried', 'cry']) expect(w.startsWith(stemPrefix(stem(w)))).toBe(true);
    expect(stemPrefix('the')).toBe('the');
  });
  test('stems Sphinx shortens or respells keep a prefix of their words', () => {
    for (const w of ['aging', 'using', 'eying', 'dying', 'lying', 'tying', 'skies', 'earthly', 'godly', 'only', 'was']) {
      expect(w.startsWith(stemPrefix(stem(w))), w).toBe(true);
    }
  });
  test('-ly words match their stem the way Sphinx does', () => {
    expect(matchesAll('Godly sorrow worketh repentance', queryStems('god'))).toBe(true);
    expect(matchesAll('if I have told you earthly things', queryStems('earth'))).toBe(true);
    expect(matchesAll('the heavenly host', queryStems('heaven'))).toBe(true);
    expect(matchesAll('Holy, holy, holy', queryStems('hole'))).toBe(false);
  });
  test('words that cannot have a query stem are not stemmed, with the same verdicts', () => {
    const text = '¶And it came to pass in the third day, that the LORD said unto Moses, Go and say to the people';
    for (const q of ['third day', '"the third day"', 'lord say', 'says', 'people moses', 'cometh', '"said unto"', '"unto said"']) {
      const terms = queryTerms(q);
      const naive = (() => {
        const words = tokenize(text).map(t => queryStems(t)[0]);
        const have = new Set(words);
        return terms.every(term => (term.length === 1 ? have.has(term[0]) : words.some((w, i) => term.every((s, j) => words[i + j] === s))));
      })();
      expect(matchesTerms(text, terms), q).toBe(naive);
    }
  });
});
