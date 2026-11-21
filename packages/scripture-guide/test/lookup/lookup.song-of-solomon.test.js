import { lookupReference, generateReference, detectReferences } from '../../dist/scriptures.mjs';

// The English name is "Solomon's Song", as in the LDS edition. The lookup fixtures cover the
// input forms; these cover the round trip and the forms the fixtures don't have.
describe("Solomon's Song", () => {
  test('a verse id round-trips through generateReference and lookupReference', () => {
    const ref = generateReference([17556]);
    expect(ref).toBe("Solomon's Song 2:1");
    expect(lookupReference(ref).verse_ids).toEqual([17556]);
  });

  test.each([
    ["solomon's song 8", "Solomon's Song 8"],
    ['Solomons Song 1:1', "Solomon's Song 1:1"],
    ['Solomon’s Song 1:1', "Solomon's Song 1:1"],
    ['song of songs 8:14', "Solomon's Song 8:14"],
    ['canticle of canticles 1:1', "Solomon's Song 1:1"],
  ])('%s', (input, ref) => {
    const result = lookupReference(input);
    expect(result.ref).toBe(ref);
    expect(result.verse_ids.length).toBeGreaterThan(0);
  });

  test('detection finds both the common name and the LDS name', () => {
    expect(detectReferences("Read Song of Solomon 2:1. Then Solomon's Song 3:1.")).toBe(
      "Read [Song of Solomon 2:1]. Then [Solomon's Song 3:1].",
    );
  });
});
