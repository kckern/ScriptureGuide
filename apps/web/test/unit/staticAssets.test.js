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
});
