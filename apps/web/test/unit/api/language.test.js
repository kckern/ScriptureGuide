import { describe, test, expect } from 'vitest';
import { languageFor } from '../../../src/api/v1/language.js';

describe('languageFor', () => {
  test('stored values become ISO 639-1 codes', () => {
    expect(languageFor('en')).toBe('en');
    expect(languageFor('kr')).toBe('ko');
    expect(languageFor('hi')).toBe('hi');
  });
  test('unknown values pass through lower-cased', () => {
    expect(languageFor('DE')).toBe('de');
  });
  test('no value is null', () => {
    expect(languageFor(null)).toBeNull();
    expect(languageFor('')).toBeNull();
    expect(languageFor(undefined)).toBeNull();
  });
});
