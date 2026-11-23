import { findReferences } from 'scripture-guide';
import { acceptMatch, guardMatches } from '../../src/content/guard.js';

const kept = (t) => guardMatches(t, findReferences(t, {})).map((m) => m.text);

describe('guard', () => {
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
    ['Ps 119:105,160', 'Ps 119:105,160'],
    ['John 3:16', 'John 3:16'],
    ['Genesis 2', 'Genesis 2']
  ])('keeps %s', (t, want) => expect(kept(t)[0]).toContain(want.split(',')[0]));

  test('passes matches without offsets', () => expect(acceptMatch('x', { ref: 'a' })).toBe(true));
});
