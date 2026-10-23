import { readFileSync } from 'node:fs';
import { describe, test, expect } from 'vitest';

const main = readFileSync(new URL('../../public/js/main.js', import.meta.url), 'utf8');

describe('public/js/main.js', () => {
  test('cover images come from media.scripture.guide', () => {
    expect(main).not.toContain('img.scripture.guide/covers');
    expect(main).toContain('https://media.scripture.guide/covers/');
  });
  test('facsimile popups do not point at the fax host (it has no DNS)', () => {
    expect(main).not.toContain('fax.scripture.guide');
  });
  // Owner decision #11 (2026-10-22): Google sign-in is dead on live too; its remnants are removed.
  test('has no Google sign-in remnants', () => {
    for (const name of ['auth2', 'googleUser', 'loginCheck', 'logout', 'signedIn']) {
      expect(main).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
  });
});

const layout = readFileSync(new URL('../../src/presentation/views/layouts/main.ejs', import.meta.url), 'utf8');

test('the layout does not load the Google API client (owner decision #11)', () => {
  expect(layout).not.toContain('apis.google.com');
  expect(layout).toContain('<script src="/js/main.js"></script>');
});
