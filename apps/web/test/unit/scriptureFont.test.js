import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test, expect } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.resolve(here, '../../public');
const repo = path.resolve(here, '../../../..');
const RECORD = 'fonts/goudy-scripture';
const style = readFileSync(path.join(pub, 'css/style.css'), 'utf8');
const goudy = (style.match(/@font-face\s*{[^}]*}/g) || []).filter(f => /font-family:\s*'Goudy Scripture'/.test(f));
const face = s => goudy.find(f => new RegExp(`font-style:\\s*${s}`).test(f));

describe('Goudy Scripture (the text font)', () => {
  test('style.css declares the upright face from /css/webfont/GoudyScripture.woff2', () => {
    const upright = face('normal');
    expect(upright).toContain("url('/css/webfont/GoudyScripture.woff2') format('woff2')");
    expect(upright).toMatch(/font-weight:\s*400 1000;/);
    expect(upright).toMatch(/font-display:\s*swap;/);
  });

  test('italic text uses Goudy Scripture Italic, a built semibold, at every weight', () => {
    const italic = face('italic');
    expect(italic).toContain("url('/css/webfont/GoudyScripture-Italic.woff2') format('woff2')");
    expect(italic).toMatch(/font-weight:\s*400 1000;/);
  });

  test('contextual alternates stay on under letter-spacing, so 600-592 shows an en dash', () => {
    expect(style).toMatch(/body\s*{[^}]*font-feature-settings:\s*"calt" 1;/);
  });

  test('every file it names is in public/css/webfont, with the OFL notice', () => {
    for (const f of goudy) {
      const url = f.match(/url\('([^']+)'\)/)[1];
      expect(existsSync(path.join(pub, url))).toBe(true);
    }
    expect(readFileSync(path.join(pub, 'css/webfont/OFL.txt'), 'utf8')).toContain('GoudyScripture.woff2 is a Modified Version of Sorts Mill Goudy');
  });

  test('is first in the body stack', () => {
    expect(style).toMatch(/body\s*{\s*font-family:\s*'Goudy Scripture',/);
  });

  // fonts/goudy-scripture/ is the font of record; the site and the extension ship plain copies.
  test.each([
    'apps/web/public/css/webfont/GoudyScripture.woff2',
    'apps/web/public/css/webfont/GoudyScripture-Italic.woff2',
    'apps/chrome-extension/fonts/GoudyScripture.woff2',
    // satori (link-preview cards) reads TTF, not woff2
    'apps/web/assets/og/GoudyScripture.ttf',
  ])('%s is byte-identical to the font of record', copy => {
    const source = `${RECORD}/${path.basename(copy)}`;
    const record = readFileSync(path.join(repo, source));
    const same = readFileSync(path.join(repo, copy)).equals(record);
    if (!same) throw new Error(`${copy} differs from ${source}; copy the font of record over it: cp ${source} ${copy}`);
    expect(same).toBe(true);
  });
});
