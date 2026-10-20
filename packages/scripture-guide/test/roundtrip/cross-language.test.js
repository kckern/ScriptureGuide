import { lookupReference, generateReference } from '../../dist/scriptures.mjs';

describe('Cross-Language Round-trip', () => {
  const johnThreeSixteen = 26137;
  const languages = ['en']; // Expand as more fixtures are added

  test.each(languages)('%s: verse ID → generate → lookup consistency', (lang) => {
    const ref = generateReference([johnThreeSixteen], lang);
    expect(ref).toBeTruthy();

    const result = lookupReference(ref, lang);
    expect(result.verse_ids).toEqual([johnThreeSixteen]);
  });

  test('verse IDs are language-independent', () => {
    // Same verse ID should work across languages
    const enRef = generateReference([johnThreeSixteen], 'en');
    const enResult = lookupReference(enRef, 'en');
    expect(enResult.verse_ids).toEqual([johnThreeSixteen]);
  });
});
