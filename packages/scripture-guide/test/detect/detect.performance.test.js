/**
 * findReferences runs on the browser's main thread (Chrome extension), once per text node.
 * A slow call freezes the page, so these inputs, each of which took 0.4-2.3 s before the
 * fixes, must stay well under a frame budget. Ceilings are generous for slow CI machines.
 */
import { findReferences } from '../../src/scriptures.mjs';

const OPTS = { language: 'en', contextAware: true, enableImpliedBooks: true, abbreviations: true };

function timed(text) {
  const start = performance.now();
  const matches = findReferences(text, OPTS);
  return { ms: performance.now() - start, matches };
}

beforeAll(() => { findReferences('John 3:16 and Alma 32:21', OPTS); }); // warm the caches

describe('findReferences stays fast on input that used to freeze pages', () => {
  test('a long run of "i" after a book-like word (regex backtracking)', () => {
    const { ms } = timed('I think Mark 5 says h' + 'i'.repeat(24) + ' to everyone');
    expect(ms).toBeLessThan(100);
  });

  test('long runs of spaces around a number', () => {
    const pad = ' '.repeat(600);
    const { ms } = timed('The price is' + pad + '12' + pad + 'dollars');
    expect(ms).toBeLessThan(100);
  });

  test('a long run of digits', () => {
    const { ms } = timed('Job ' + '1'.repeat(8000) + ' is done');
    expect(ms).toBeLessThan(150);
  });

  test('prose where times and dates look like implied references', () => {
    const unit = 'And it came to pass that in the 3rd year, as recorded in Alma 32:21 and verse 27, '
      + 'they met on 12 March 2019 at 4:30 pm for chapter 5 discussion. ';
    const { ms, matches } = timed(unit.repeat(140)); // 20 KB
    expect(matches.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(150);
  });

  test('book names that never become references', () => {
    const { ms } = timed('Photo by Mark 2020. Job 48213 posted by Luke. '.repeat(450)); // 20 KB
    expect(ms).toBeLessThan(150);
  });

  test('a page of bare book names', () => {
    const { ms } = timed('John Mark Luke Acts Job Ruth Amos 5 '.repeat(1400)); // 50 KB
    expect(ms).toBeLessThan(200);
  });

  test('a long list of references', () => {
    const { ms, matches } = timed('John 3:16; 1 Ne. 3:7, 2 Ne. 2:25 and Mosiah 2:17. '.repeat(1000)); // 50 KB
    expect(matches.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(300);
  });
});
