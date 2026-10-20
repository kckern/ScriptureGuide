// test/unit/options-resolver.test.js
import {
  resolveOptions,
  setDefaults,
  getDefaults,
  isKnownLanguage,
  isKnownCanon
} from '../../src/lib/options-resolver.mjs';

describe('Options Resolver', () => {
  beforeEach(() => {
    setDefaults({ language: 'en', canon: 'lds', fuzzyCanon: true });
  });

  test('undefined returns defaults', () => {
    const opts = resolveOptions(undefined);
    expect(opts.language).toBe('en');
    expect(opts.canon).toBe('lds');
    expect(opts.fuzzyCanon).toBe(true);
  });

  test('string recognized as language', () => {
    const opts = resolveOptions('ko');
    expect(opts.language).toBe('ko');
    expect(opts.canon).toBe('lds');
  });

  test('string recognized as canon when not a language', () => {
    const opts = resolveOptions('bible');
    expect(opts.language).toBe('en');
    expect(opts.canon).toBe('bible');
  });

  test('string recognized as canon - shakespeare', () => {
    const opts = resolveOptions('shakespeare');
    expect(opts.language).toBe('en');
    expect(opts.canon).toBe('shakespeare');
  });

  test('object merges with defaults', () => {
    const opts = resolveOptions({ canon: 'bible', fuzzyCanon: false });
    expect(opts.language).toBe('en');
    expect(opts.canon).toBe('bible');
    expect(opts.fuzzyCanon).toBe(false);
  });

  test('unknown string throws error', () => {
    expect(() => resolveOptions('xyz123')).toThrow('Unknown language or canon');
  });

  test('isKnownLanguage works', () => {
    expect(isKnownLanguage('en')).toBe(true);
    expect(isKnownLanguage('ko')).toBe(true);
    expect(isKnownLanguage('bible')).toBe(false);
  });

  test('isKnownCanon works', () => {
    expect(isKnownCanon('bible')).toBe(true);
    expect(isKnownCanon('lds')).toBe(true);
    expect(isKnownCanon('shakespeare')).toBe(true);
    expect(isKnownCanon('en')).toBe(false);
  });
});
