// A list reads each part the way that part reads on its own. Single-chapter books are the
// trap: alone, "4 Ne 1" is the whole chapter and "Obad 3" is verse 3; in a list the first
// part used to become verse 1 ("4 Ne 1; JS-H 1" -> 4 Nephi 1:1) and later parts were not
// read as single-chapter books at all ("Mt 5; Obad 3" lost Obadiah).
import { lookupReference } from '../../src/scriptures.mjs';

const SINGLE_CHAPTER_BOOKS = [
  'Obad', 'Philem', '2 Jn', '3 Jn', 'Jude',
  '4 Ne', 'Enos', 'Jarom', 'Omni', 'W of M', 'JS-H', 'JS-M',
];

const ids = (query) => lookupReference(query).verse_ids;

describe('single-chapter books in a list read as they do alone', () => {
  describe.each(SINGLE_CHAPTER_BOOKS)('%s', (book) => {
    test.each(['1', '3'])(`"${book} %s" first in a list`, (n) => {
      const alone = ids(`${book} ${n}`);
      expect(alone.length).toBeGreaterThan(0);
      expect(ids(`${book} ${n}; Mt 5`)).toEqual([...alone, ...ids('Mt 5')]);
    });

    test.each(['1', '3'])(`"${book} %s" later in a list`, (n) => {
      const alone = ids(`${book} ${n}`);
      expect(ids(`Mt 5; ${book} ${n}`)).toEqual([...ids('Mt 5'), ...alone]);
    });
  });

  test('two single-chapter books in a list are two whole chapters', () => {
    expect(lookupReference('4 Ne 1; JS-H 1').ref).toBe('4 Nephi 1; Joseph Smith—History 1');
  });

  test.each([
    ['Jn 3:16, 18', 'John 3:16; 3:18'],
    ['Mt 5:3; 7', 'Matthew 5:3; 7:1-29'],
    ['4 Ne 5', '4 Nephi 1:5'],
    ['4 Ne 1:5', '4 Nephi 1:5'],
    ['Obad 1:3', 'Obadiah 1:3'],
  ])('a bare number still continues its own part: %j', (query, ref) => {
    expect(lookupReference(query).ref).toBe(ref);
  });
});
