// The same string, two answers: lookup reads what it is given as generously as it can
// (the search box, scripture.guide/l3); detection links only what clearly is a reference.
// Fixing one by changing the shared book patterns breaks the other: this test catches that.
import { lookupReference, findReferences } from '../../src/scriptures.mjs';

describe('lookup is lenient, detection is strict', () => {
  test.each([
    ['L3', 'Luke 3'],
    ['l3', 'Luke 3'],
    ['lu 3', 'Luke 3'],
  ])('%j looks up as %s but is not detected in prose', (text, ref) => {
    expect(lookupReference(text).ref).toBe(ref);
    expect(findReferences(`Extracted facts (${text}) will appear here.`)).toEqual([]);
  });

  test('a strong form is both looked up and detected', () => {
    expect(lookupReference('Lk 21').ref).toBe('Luke 21');
    expect(findReferences('See Lk 21 today.').map(r => r.ref)).toEqual(['Luke 21']);
  });
});
