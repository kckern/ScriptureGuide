import { detectReferences, generateReference } from '../../dist/scriptures.mjs';
import { loadProseSample } from '../helpers/fixture-loader.js';

describe('detectReferences - Snapshot Regression', () => {
  describe('English prose samples', () => {
    test('vvtest-en.txt with contextAware: true', () => {
      const content = loadProseSample('en', 'vvtest-en.txt');
      const result = detectReferences(
        content,
        (originalText, verseIds) => {
          const canonical = generateReference(verseIds, 'en');
          return `[${originalText}|${canonical}]`;
        },
        { language: 'en', contextAware: true }
      );

      expect(result).toMatchSnapshot();
    });

    test('vvtest-en.txt with contextAware: false', () => {
      const content = loadProseSample('en', 'vvtest-en.txt');
      const result = detectReferences(
        content,
        (originalText, verseIds) => {
          const canonical = generateReference(verseIds, 'en');
          return `[${originalText}|${canonical}]`;
        },
        { language: 'en', contextAware: false }
      );

      expect(result).toMatchSnapshot();
    });

    test('testDetect.en.txt with contextAware: true', () => {
      const content = loadProseSample('en', 'testDetect.en.txt');
      const result = detectReferences(
        content,
        (originalText, verseIds) => {
          const canonical = generateReference(verseIds, 'en');
          return `[${originalText}|${canonical}]`;
        },
        { language: 'en', contextAware: true }
      );

      expect(result).toMatchSnapshot();
    });
  });

  describe('Korean prose samples', () => {
    test('vvtest-ko.txt with contextAware: true', () => {
      const content = loadProseSample('ko', 'vvtest-ko.txt');
      const result = detectReferences(
        content,
        (originalText, verseIds) => {
          const canonical = generateReference(verseIds, 'ko');
          return `[${originalText}|${canonical}]`;
        },
        { language: 'ko', contextAware: true }
      );

      expect(result).toMatchSnapshot();
    });
  });
});
