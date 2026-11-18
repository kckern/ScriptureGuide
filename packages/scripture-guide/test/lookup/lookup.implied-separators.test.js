import { lookupReference } from '../../dist/scriptures.mjs';

const WITH_SEMICOLONS = 'D&C 88:1-17; Matthew 11:28-30; Mosiah 5:5-8; Abraham 2:8-11';

describe('lookupReference - references with no separator between them', () => {
  const expected = lookupReference(WITH_SEMICOLONS);

  test.each([
    ['spaces', 'D&C 88:1-17 Matthew 11:28-30 Mosiah 5:5-8 Abraham 2:8-11'],
    ['dots, as the proxy rewrites spaces', 'D&C.88:1-17.Matthew.11:28-30.Mosiah.5:5-8.Abraham.2:8-11'],
  ])('%s', (_name, input) => {
    const result = lookupReference(input);
    expect(result.ref).toBe(expected.ref);
    expect(result.verse_ids).toEqual(expected.verse_ids);
  });

  test('a book whose name starts with a number', () => {
    expect(lookupReference('John 3:16 1 Nephi 3:7').ref).toBe('John 3:16; 1 Nephi 3:7');
    expect(lookupReference('john.3.16.1.ne.3.7').ref).toBe('John 3:16; 1 Nephi 3:7');
    expect(lookupReference('1 John 1:1 2 John 1:1').ref).toBe('1 John 1:1; 2 John 1:1');
  });

  test('a range across books stays one range', () => {
    expect(lookupReference('Malachi 4:5-Matthew 1:2').ref).toBe('Malachi 4:5 - Matthew 1:2');
    expect(lookupReference('mal.4.5-matt.1.2').ref).toBe('Malachi 4:5 - Matthew 1:2');
  });

  test('a single reference is unchanged', () => {
    expect(lookupReference('1 Nephi 3:7').ref).toBe('1 Nephi 3:7');
    expect(lookupReference('1.ne.3.7').ref).toBe('1 Nephi 3:7');
    expect(lookupReference('john.3.16').ref).toBe('John 3:16');
  });
});
