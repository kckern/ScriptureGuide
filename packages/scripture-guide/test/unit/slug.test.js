import { toSlug } from '../../src/scriptures.mjs';

describe('toSlug', () => {
  test('simple verse', () => {
    expect(toSlug('John 3:16')).toBe('john.3.16');
  });
  test('numbered book and range', () => {
    expect(toSlug('1 Nephi 3:7-10')).toBe('1.nephi.3.7-10');
  });
  test('normalizes en-dash and em-dash ranges to hyphen', () => {
    expect(toSlug('Matthew 5:3–12')).toBe('matthew.5.3-12');
    expect(toSlug('Matthew 5:3—12')).toBe('matthew.5.3-12');
  });
  test('compound refs keep semicolons, drop redundant dots', () => {
    expect(toSlug('Exodus 5:1; Leviticus 6:2')).toBe('exodus.5.1;leviticus.6.2');
  });
  test('split verses keep commas', () => {
    expect(toSlug('Exodus 20:5,10')).toBe('exodus.20.5,10');
  });
  test('trims and lowercases', () => {
    expect(toSlug('  Genesis 1:1  ')).toBe('genesis.1.1');
  });
});
