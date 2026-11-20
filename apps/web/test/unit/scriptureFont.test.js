import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test, expect } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.resolve(here, '../../public');
const repo = path.resolve(here, '../../../..');
const OF_RECORD = 'fonts/goudy-scripture/GoudyScripture.woff2';
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

  test('italic text uses Sorts Mill Goudy Italic', () => {
    const italic = face('italic');
    expect(italic).toContain("url('/css/webfont/SortsMillGoudy-Italic.woff')");
    expect(italic).toMatch(/font-weight:\s*400;/);
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
    'apps/chrome-extension/fonts/GoudyScripture.woff2',
  ])('%s is byte-identical to the font of record', copy => {
    const record = readFileSync(path.join(repo, OF_RECORD));
    const same = readFileSync(path.join(repo, copy)).equals(record);
    if (!same) throw new Error(`${copy} differs from ${OF_RECORD}; copy the font of record over it: cp ${OF_RECORD} ${copy}`);
    expect(same).toBe(true);
  });
});
