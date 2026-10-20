import { describe, test, expect } from 'vitest';
import { passageInner, passageInners } from '../../src/presentation/legacy/passageHtml.js';

describe('passageInner', () => {
  const page = `<html><body><div id="container"><div class="scriptures"><div class="section">
      <div class="passage ver_KJV">
        <h3 class="heading">Genesis 1</h3>
        <div class="summary">x</div>
        <p class="prose"><span class="verse">In the beginning</span></p>
      </div>
      <div class="passage ver_">
        <div class="chapterNav"><a>next</a></div>
      </div></div></div></div></body></html>`;

  test('returns the inner HTML of the passage div for the version', () => {
    const inner = passageInner(page, 'KJV');
    expect(inner).toContain('<h3 class="heading">Genesis 1</h3>');
    expect(inner).toContain('<div class="summary">x</div>');
    expect(inner).not.toContain('chapterNav');
  });

  test('accepts single-quoted class attributes', () => {
    expect(passageInner(`<div class='passage ver_WEB'><p>a</p></div>`, 'WEB')).toBe('<p>a</p>');
  });

  test('null when there is no passage div', () => {
    expect(passageInner('<div>nothing</div>', 'KJV')).toBeNull();
  });
});

describe('passageInners', () => {
  test('returns every passage div for the version, in order, skipping other versions', () => {
    const page = `<div class="section">
      <div class="passage ver_KJV"><h3>A</h3><div><p>1</p></div></div>
      <div class="passage ver_">nav</div>
      <div class="passage ver_KJV"><h3>B</h3><p>2</p></div></div>`;
    expect(passageInners(page, 'KJV')).toEqual(['<h3>A</h3><div><p>1</p></div>', '<h3>B</h3><p>2</p>']);
  });

  test('empty when there is no passage div', () => {
    expect(passageInners('<div>nothing</div>', 'KJV')).toEqual([]);
  });
});
