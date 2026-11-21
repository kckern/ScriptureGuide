// A list reads each part the way that part reads alone: ids("A; B") === ids(A) + ids(B).
// Lookup backs every scripture.guide URL, so a part that a list drops or rereads is a broken link.
// A later "book c:v, v" part used to be dropped ("Gen 1; Mt 5:3, 7" gave only Genesis 1), and a
// colon anywhere in the query switched off the comma rule for every part.
import { lookupReference } from '../../src/scriptures.mjs';

const ids = (query) => lookupReference(query).verse_ids;

const PARTS = [
  'Mt 5:3, 7', 'Jn 3:16, 18', 'Alma 32:21, 23', 'D&C 88:1, 3', '1 Nephi 3:7-8, 10',
  'Gen 1, 3', 'Gen 3, 5', 'Gen 1, 3-5', 'Mt 5, 7',
  'Jude 1', 'Jude 3', 'Jude 1, 3', 'Enos 1, 3', 'Obad 1:3', '4 Ne 1', 'JS-H 1:17',
  'Philem 1:4', '2 Jn 1:3',
  'Mt 5:3-7', 'Gen 1-3', 'Ex 20:1-17', 'Isa 53:3-5', 'Mal 4:5-6', 'Moro 10:4-5',
  'D&C 76', 'D&C 76:22-24',
  'Alma 32:21', '1 Ne 3:7', 'Ps 23', 'Ps 119:105', 'Rev 22:21', 'Ether 12:27', 'Mosiah 2:17',
];

describe('each part of a list reads as it does alone', () => {
  test.each(PARTS)('%s resolves alone', (part) => {
    expect(ids(part).length).toBeGreaterThan(0);
  });

  test.each(PARTS)('"Gen 1; %s"', (part) => {
    expect(ids(`Gen 1; ${part}`)).toEqual([...ids('Gen 1'), ...ids(part)]);
  });

  test.each(PARTS)('"Alma 32:21; %s"', (part) => {
    expect(ids(`Alma 32:21; ${part}`)).toEqual([...ids('Alma 32:21'), ...ids(part)]);
  });

  test.each(PARTS)('"%s; Mt 5"', (part) => {
    expect(ids(`${part}; Mt 5`)).toEqual([...ids(part), ...ids('Mt 5')]);
  });

  test.each([
    ['Gen 1; Mt 5:3, 7', 'Genesis 1; Matthew 5:3; 5:7'],
    ['Gen 1; Gen 3, 5', 'Genesis 1; 3:1-24; 5:1-32'],
    ['Alma 32; Enos 1, 3', 'Alma 32; Enos 1:1; 1:3'],
    ['Gen 1; Jude 1, 3', 'Genesis 1; Jude 1:1; 1:3'],
    ['Gen 1:1; Gen 3, 5', 'Genesis 1:1; 3:1-24; 5:1-32'],
  ])('%j', (query, ref) => {
    expect(lookupReference(query).ref).toBe(ref);
    const [a, b] = query.split('; ');
    expect(ids(query)).toEqual([...ids(a), ...ids(b)]);
  });
});
