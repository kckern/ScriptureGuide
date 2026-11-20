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
  expect(layout).toContain('<script src="/js/main.js<%= av %>"></script>');
});

describe('browser preferences (public/js/prefs.js)', () => {
  test('main.js reads SGPrefs, not the old user_prefs or the "verses" key', () => {
    expect(main).not.toContain('user_prefs');
    expect(main).not.toMatch(/localStorage/);
    expect(main).not.toMatch(/\bsaveSettings\b|save\.php|save_prefs/);
    expect(main).toContain("SGPrefs.get('verseNumbers')");
  });
  test('the layout loads prefs.js in the head, before the stylesheets and main.js', () => {
    expect(layout).not.toContain('user_prefs');
    const at = s => layout.indexOf(s);
    expect(at('/js/prefs.js')).toBeGreaterThan(0);
    expect(at('/js/prefs.js')).toBeLessThan(at('/css/style.css'));
    expect(at('/js/prefs.js')).toBeLessThan(at('/js/main.js'));
    expect(at('/js/prefsPanel.js')).toBeGreaterThan(at('/js/main.js'));
    expect(at('/js/prefs.js')).toBeLessThan(at('</head>'));
  });
  test('the verse panel asks for the preferred tab instead of a saved account setting', () => {
    const fl = readFileSync(new URL('../../public/js/featherlight.js', import.meta.url), 'utf8');
    expect(fl).toContain('panel:(window.SGPrefs ? SGPrefs.get("verpanel") : "")');
  });
});
