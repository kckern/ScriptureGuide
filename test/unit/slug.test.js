import { refToSlug } from '../../src/shared/slug.js';

describe('refToSlug', () => {
  test('simple verse', () => {
    expect(refToSlug('John 3:16')).toBe('john.3.16');
  });
  test('numbered book and range', () => {
    expect(refToSlug('1 Nephi 3:7-10')).toBe('1.nephi.3.7-10');
  });
  test('normalizes en-dash and em-dash ranges to hyphen', () => {
    expect(refToSlug('Matthew 5:3–12')).toBe('matthew.5.3-12');
    expect(refToSlug('Matthew 5:3—12')).toBe('matthew.5.3-12');
  });
  test('compound refs keep semicolons, drop redundant dots', () => {
    expect(refToSlug('Exodus 5:1; Leviticus 6:2')).toBe('exodus.5.1;leviticus.6.2');
  });
  test('split verses keep commas', () => {
    expect(refToSlug('Exodus 20:5,10')).toBe('exodus.20.5,10');
  });
  test('trims and lowercases', () => {
    expect(refToSlug('  Genesis 1:1  ')).toBe('genesis.1.1');
  });
});
