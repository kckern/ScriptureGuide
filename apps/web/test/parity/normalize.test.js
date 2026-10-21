import { describe, test, expect } from 'vitest';
import { canonicalHtml, canonicalJson, compare, canonicalAsset, encodeCacheEntry, decodeCacheEntry, homeCleanups, rawSearchterm } from './normalize.mjs';

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
  test('SVG is compared as text', () => {
    expect(canonicalAsset('image/svg+xml', Buffer.from('<svg/>  \r\n'))).toBe('<svg/>');
  });
});

describe('cache entries', () => {
  test('an old entry with a string body decodes to the same bytes', () => {
    const body = 'héllo <b>world</b>';
    const res = decodeCacheEntry({ status: 200, type: 'text/html', body });
    expect(res.buf.equals(Buffer.from(body, 'utf8'))).toBe(true);
    expect(res.body).toBe(body);
  });
  test('binary bodies round-trip through base64', () => {
    const buf = Buffer.from([0, 255, 128, 10, 13]);
    const entry = encodeCacheEntry({ status: 200, type: 'font/woff', buf });
    expect(entry.body).toBeUndefined();
    expect(typeof entry.bodyBase64).toBe('string');
    expect(decodeCacheEntry(JSON.parse(JSON.stringify(entry))).buf.equals(buf)).toBe(true);
  });
  test('textual bodies stay a utf8 string body', () => {
    const entry = encodeCacheEntry({ status: 200, type: 'text/css; charset=UTF-8', buf: Buffer.from('a {}') });
    expect(entry).toEqual({ status: 200, type: 'text/css; charset=UTF-8', body: 'a {}' });
  });
});

describe('homeCleanups', () => {
  const live = canonicalHtml(`<div><input type="text" value="Test" name="searchbox" id="searchbox"/>
    <a class="button" href="https://chrome.google.com/webstore/detail/scripture-guide/abc?hl=en&fbclid=IwAR2x-y_z" target="_blank">Install</a>
    <img src="/img/chrome.png" width="128" style="float:left; margin-bottom:100px;margin-top:50px; margin-right:30px;"/>
    <h3 style="line-heigth:1em">Chrome Extension</h3></div>`);
  const node = canonicalHtml(`<div><input type="text" value="" name="searchbox" id="searchbox">
    <a class="button" href="https://chrome.google.com/webstore/detail/scripture-guide/abc?hl=en" target="_blank">Install</a>
    <img src="/img/chrome.png" width="128" style="float:left; margin-bottom:100px; margin-top:50px; margin-right:30px;">
    <h3 style="line-height:1em">Chrome Extension</h3></div>`);
  test('the live home page markup reads as the cleaned-up Node markup', () => {
    expect(homeCleanups(live)).toBe(node);
    expect(homeCleanups(node)).toBe(node);
  });
  test('leaves other values alone', () => {
    const other = canonicalHtml('<input id="searchbox" name="searchbox" type="text" value="faith"><a href="https://example.com/?fbclid=1">x</a><p style="line-heigth:2em">y</p>');
    expect(homeCleanups(other)).toBe(other);
  });
});

describe('rawSearchterm', () => {
  test("Node's escaped search term reads as the raw term live prints", () => {
    const live = 'x\nsearchterm = "" a(b) attr("c") ""; versions_index = null';
    const node = 'x\nsearchterm = "\\" a(b) attr(\\"c\\") \\""; versions_index = null';
    expect(rawSearchterm(node)).toBe(live);
    expect(rawSearchterm(live)).toBe(live);
  });
  test('decodes the escaped "<" too, and leaves a different term different', () => {
    expect(rawSearchterm('searchterm = "\\u003cb\\u003e";')).toBe('searchterm = "<b>";');
    expect(rawSearchterm('searchterm = "faith";')).not.toBe('searchterm = "hope";');
  });
});
