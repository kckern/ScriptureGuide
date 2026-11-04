import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test, expect } from 'vitest';

const pub = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');
const versions = readFileSync(path.join(pub, 'css/versions.css'), 'utf8');
const faces = versions.match(/@font-face\s*{[^}]*}/g);

const ruleFor = version => {
  const rule = versions.match(new RegExp(`\\.ver_${version}\\b[^{}]*{[^}]*}`))?.[0];
  if (!rule) throw new Error(`no rule for ${version}`);
  return rule;
};

describe('language fonts', () => {
  test('are self-hosted, and every file exists', () => {
    expect(faces.length).toBeGreaterThan(0);
    for (const face of faces) {
      const url = face.match(/url\(['"]?([^'")]+)/)[1];
      expect(url).toMatch(/^\/css\/webfont\//);
      expect(existsSync(path.join(pub, url))).toBe(true);
    }
  });

  // The seven Korean versions in scripture_versions.
  test.each(['KRBOM', 'KRSEB', 'KLB', 'KRLDS', 'ERKRB', 'KRBOM67', 'KRREB'])('%s uses the Korean font', version => {
    const rule = ruleFor(version);
    expect(rule).toContain("'SG Batang'");
  });

  test('the site-wide stack reaches them, so pages without a version class (parallel) are covered', () => {
    const style = readFileSync(path.join(pub, 'css/style.css'), 'utf8');
    const body = style.match(/\bbody\s*{[^}]*}/)[0];
    expect(body).toMatch(/font-family:[^;]*'SG Hangul'[^;]*'Noto Serif Devanagari'/);
    expect(body).toContain('word-break: keep-all');
  });

  test('faces in the site-wide stack have a unicode-range, so English pages do not download them', () => {
    const global = faces.filter(f => /'SG Hangul'|'Noto Serif Devanagari'/.test(f));
    expect(global).toHaveLength(4);
    for (const face of global) expect(face).toContain('unicode-range');
  });

  test('Korean uses the renamed subset, not the Reserved Font Name', () => {
    expect(versions).not.toMatch(/font-family:\s*'KoPub Batang'/);
  });

  test('Hindi uses Noto Serif Devanagari', () => {
    expect(ruleFor('HIBOM')).toContain("'Noto Serif Devanagari'");
  });

  test('the OFL notice covers the fonts added here', () => {
    const ofl = readFileSync(path.join(pub, 'css/webfont/OFL.txt'), 'utf8');
    expect(ofl).toContain('Korea Publishers Society');
    expect(ofl).toContain('The Noto Project Authors');
  });
});
