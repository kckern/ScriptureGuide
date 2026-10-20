import { describe, test, expect } from 'vitest';
import { canonicalHtml, canonicalJson, compare, canonicalAsset } from './normalize.mjs';

describe('canonicalHtml', () => {
  test('ignores quote style, attribute order and whitespace between tags', () => {
    const a = `<div class='a'  id="x">\n\t<span b="2" a="1">Hi  there</span>\n</div>`;
    const b = `<div id="x" class="a"><span a="1" b="2">Hi there</span></div>`;
    expect(canonicalHtml(a)).toBe(canonicalHtml(b));
  });
  test('keeps text differences', () => {
    expect(canonicalHtml('<h3>John 3:16</h3>')).not.toBe(canonicalHtml('<h3>John 3</h3>'));
  });
  test('keeps extra elements', () => {
    expect(canonicalHtml('<p>a</p>')).not.toBe(canonicalHtml('<p>a</p><div class="x"></div>'));
  });
  test('can scope to a selector', () => {
    const page = '<html><head><title>T</title></head><body><nav>x</nav><div id="container"><p>a</p></div></body></html>';
    expect(canonicalHtml(page, '#container')).toBe(canonicalHtml('<div id="container"><p>a</p></div>'));
  });
});

describe('canonicalJson', () => {
  test('ignores key order and formatting', () => {
    expect(canonicalJson('{"b":1,\n "a":[1,2]}')).toBe(canonicalJson('{"a":[1,2],"b":1}'));
  });
  test('normalizes embedded HTML strings under the given keys', () => {
    expect(canonicalJson(`{"output":"<p class='x'> a</p>"}`, ['output'])).toBe(canonicalJson('{"output":"<p class=\\"x\\">a</p>"}', ['output']));
  });
});

describe('compare', () => {
  test('reports equal and the first differing line', () => {
    expect(compare('a\nb\nc', 'a\nb\nc')).toEqual({ equal: true });
    expect(compare('a\nb\nc', 'a\nX\nc')).toEqual({ equal: false, line: 2, expected: 'b', actual: 'X' });
  });
});

describe('canonicalAsset', () => {
  test('text assets ignore CRLF and trailing whitespace', () => {
    expect(canonicalAsset('text/css', Buffer.from('a {}\r\nb {}  \r\n'))).toBe(canonicalAsset('text/css', Buffer.from('a {}\nb {}\n')));
  });
  test('binary assets compare by sha256', () => {
    expect(canonicalAsset('font/woff', Buffer.from([1, 2, 3]))).toMatch(/^sha256 [0-9a-f]{64} 3 bytes$/);
  });
});
