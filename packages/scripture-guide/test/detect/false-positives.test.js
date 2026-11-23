import { findReferences, detectReferences } from '../../src/scriptures.mjs';

const kept = (t, o = {}) => findReferences(t, o).map((m) => m.text);

describe('false-positive guard (English)', () => {
  test.each([
    'Researchers Reveal Wood Is 4,300 Years Old',
    'It Is 4,300 years',
    'Mark 5 times in a row',
    'Ex 4,300',
    'Am 3',
    'Is 4',
    'Job 3 people came'
  ])('rejects %s', (t) => expect(kept(t)).toEqual([]));

  test.each([
    ['Is 40:3', 'Is 40:3'],
    ['Am 3:7', 'Am 3:7'],
    ['See Job 3', 'Job 3'],
    ['Mark 5', 'Mark 5'],
    ['Ps 119:105,160', 'Ps 119:105'],
    ['John 3:16', 'John 3:16'],
    ['Genesis 2', 'Genesis 2']
  ])('keeps %s', (t, want) => expect(kept(t)[0]).toContain(want));

  test('guardFalsePositives: false restores the old behavior', () => {
    expect(kept('Wood Is 4,300 Years Old', { guardFalsePositives: false })).toEqual(['Is 4,300']);
  });

  test('detectReferences does not link the false positive', () => {
    expect(detectReferences('Wood Is 4,300 Years Old', (r) => `[${r}]`)).toBe('Wood Is 4,300 Years Old');
    expect(detectReferences('See Is 40:3', (r) => `[${r}]`)).toContain('[');
  });

  test('other languages are untouched', () => {
    expect(findReferences('Joh 3,16', { language: 'de' }).length).toBeGreaterThan(0);
  });
});
