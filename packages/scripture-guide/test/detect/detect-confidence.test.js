// The detection-only confidence bar: how much a match's book token must show, given its numbers.
// Lookup never calls this; see lookup-vs-detect.test.js.
import { passesDetectionBar } from '../../src/detectconfidence.mjs';
import { detectReferences, lookupReference } from '../../src/scriptures.mjs';
import { assertDetectInvariants } from '../helpers/detect-invariants.js';

describe('passesDetectionBar', () => {
  test.each([
    // [book token as written, number part, detected?]
    ['L', '3', false],
    ['L.', ' 3', false],
    ['L', ' 3:16', true],
    ['L', '3.5', false],
    ['Lu', ' 3', true],
    ['lu', ' 3', false],
    ['lk', ' 3', false],
    ['Lk', ' 21', true],
    ['Mt', ' 24', true],
    ['mt', ' 5:3', true],
    ['Pss', ' 120-134', true],
    ['luke', ' 3', true],
    ['leviticus', ' 19', true],
    ['2 Jn', ' 1', true],
    ['II Jn', ' 1', true],
    ['4Ne', ' 1', true],
    ['IV Ne', ' 1', true],
    ['4 Ne.', ' 1', true],
    ['JS-M', ' 1', true],
    ['AF', ' 1', true],
    ['First book of Ne', ' 1', true],
    ['éx', ' 3', false],
    ['Éx', ' 3', true],
    ['Génesis', ' 1', true],
    ['Мф', ' 5', true],
    ['мф', ' 5', false],
    ['창', ' 3', true],
    ['創', '3', true],
    // A numeral before a one-letter book is evidence: French "1 S 3,10", "2 R 5,14"
    ['1 S', ' 3,10', true],
    ['2 R', ' 5,14', true],
    ['1 R', ' 19', true],
    ['1 S', ' 3.10', true],
    ['1 s', ' 3', false],
  ])('%j %j → %s', (token, numbers, expected) => {
    expect(passesDetectionBar(token, numbers)).toBe(expected);
  });
});

// The fixture loader assigns each case its file's language, so French detection is tested here.
describe('the bar in French running text', () => {
  test.each([
    ['Lisez 1 S 3,10 et 2 R 5,14.', 'Lisez [1 S 3,10] et [2 R 5,14].'],
    ['Voir 1 R 19 et 2 S 7.', 'Voir [1 R 19] et [2 S 7].'],
  ])('%j → %j', (input, expected) => {
    for (const contextAware of [true, false]) {
      const options = { language: 'fr', contextAware };
      expect(detectReferences(input, (text) => `[${text}]`, options)).toBe(expected);
      expect(() => assertDetectInvariants({ detectReferences, lookupReference }, input, options)).not.toThrow();
    }
  });
});
