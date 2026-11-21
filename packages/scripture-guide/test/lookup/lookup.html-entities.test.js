// A string caller may pass text with HTML entity dashes; lookup reads them as the dashes they are.
import { lookupReference } from '../../src/scriptures.mjs';

test.each([
  ['Mt 5:3&ndash;5', 'Matthew 5:3-5'],
  ['Lu 3&#8212;4', 'Luke 3-4'],
  ['Mt 5:3&#8211;5', 'Matthew 5:3-5'],
  ['Lu 3&mdash;4', 'Luke 3-4'],
])('%j looks up as %s', (query, ref) => {
  expect(lookupReference(query).ref).toBe(ref);
});
