// The detection-only confidence bar: how much a match's book token must show, given its numbers.
// Lookup never calls this; see lookup-vs-detect.test.js.
import { passesDetectionBar } from '../../src/detectconfidence.mjs';

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
    ['창', ' 3', true],
    ['創', '3', true],
  ])('%j %j → %s', (token, numbers, expected) => {
    expect(passesDetectionBar(token, numbers)).toBe(expected);
  });
});
