import { describe, test, expect } from 'vitest';
import { canonicalHtml, canonicalJson, compare, canonicalAsset, encodeCacheEntry, decodeCacheEntry, homeCleanups, rawSearchterm, staleSectionHeading, staleSectionVerse, singleHeadingDrops } from './normalize.mjs';

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

// Canonical NRSV Ps. 23 (shortened): live heads it with Psalm 22's section and an ellipsis.
describe('staleSectionHeading', () => {
  const span = (id, text) => [`        <span class="verse v_${id} prose" verse_id="${id}">`, `          ${JSON.stringify(text)}`];
  const nav = labels => ['      <div class="passage ver_">', '        <div class="chapterNav">',
    '          <a class="prev" href="/nrsv/ps.22">', `            "${labels[0]}"`,
    '          <a class="next" href="/nrsv/ps.24">', `            "${labels[1]}"`];
  const page = (head, first, labels, after = []) => ['STATUS 200', 'TITLE Psalms 23 | Scripture Guide', '<div id="container">',
    '      <div class="passage ver_NRSV">', ...head, '        <p class="prose">', ...span(14237, first), ...after, ...span(14238, 'He makes me lie down'),
    ...nav(labels)].join('\n');
  const h3 = (id, last, count, text) => [`        <h3 class="heading" heading_verse_id="${id}" last_verse_id="${last}" ref="Psalms 23" ver="NRSV" verse_count="${count}">`, `          "${text}"`];
  const stale = [...h3(14206, 14236, 30, 'Plea for Deliverance'),
    '        <p class="ellipses" heading_verse_id="14206" last_verse_id="14236" verse_count="31">', '          "..."'];
  const own = h3(14237, 14242, 5, 'The Divine Shepherd');
  const raw = { text: '§A Psalm of David.¶▼The Lord is my shepherd', headings: { heading: 'The Divine Shepherd', last: 14242 } };
  const live = page(stale, '§A Psalm of David.', ['◀ Psalms 22', 'Psalms 24 ▶']);
  const node = page(own, '§A Psalm of David.', ['◀ Plea for Deliverance', 'Entrance into the Temple ▶']);

  test('staleSectionVerse names the first verse of the pattern', () => {
    expect(staleSectionVerse(live)).toEqual({ version: 'NRSV', verseId: 14237 });
    expect(staleSectionVerse(node)).toBeNull();
  });
  test('puts the raw heading of the first verse in place of live\'s heading before it, and the nav labels', () => {
    expect(staleSectionHeading(live, node, raw)).toBe(node);
  });
  test('leaves other differences', () => {
    const other = node.replace('He makes me lie down', 'He maketh me to lie down');
    expect(staleSectionHeading(live, other, raw)).not.toBe(other);
  });
  test('Node\'s heading must be the raw heading, its range the section\'s, its other attributes live\'s', () => {
    expect(staleSectionHeading(live, node, { ...raw, headings: { ...raw.headings, heading: 'Other' } })).toBeNull();
    expect(staleSectionHeading(live, node, { ...raw, headings: { ...raw.headings, last: 14241 } })).toBeNull();
    expect(staleSectionHeading(live, node.replace('ref="Psalms 23"', 'ref="Psalms 23:1"'), raw)).toBeNull();
    expect(staleSectionHeading(live, node, undefined)).toBeNull();
  });
  test('only when the raw first verse starts a section with "§" (not "§¶")', () => {
    expect(staleSectionHeading(live, node, { ...raw, text: 'A Psalm of David.¶▼The Lord' })).toBeNull();
    expect(staleSectionHeading(live, node, { ...raw, text: '§¶The Lord' })).toBeNull();
    expect(staleSectionHeading(live, node, { ...raw, text: 'Then Nathan went home.§¶The Lord' })).toBeNull();
  });
  test('after a division label (NET Ps. 90:1 "Book 4 (Psalms 90-106)§A prayer…")', () => {
    const label = 'Book 4 (Psalms 90-106)§A Psalm of David.';
    expect(staleSectionHeading(page(stale, label, ['◀ Psalms 22', 'Psalms 24 ▶']), page(own, label, ['◀ Plea for Deliverance', 'Entrance into the Temple ▶']),
      { ...raw, text: label + '¶▼The Lord' })).toBe(page(own, label, ['◀ Plea for Deliverance', 'Entrance into the Temple ▶']));
  });
  test('only when the ellipsis ends right before the first verse', () => {
    expect(staleSectionHeading(live.replace(/last_verse_id="14236"/g, 'last_verse_id="14235"'), node, raw)).toBeNull();
  });
  test('nav labels only where the links are the same', () => {
    const moved = node.replace('href="/nrsv/ps.24"', 'href="/nrsv/ps.25"');
    expect(staleSectionHeading(live, moved, raw)).not.toBe(moved);
  });
  test('a label before "§¶" (NIV Ps. 1:1 "§Psalms 1–41§¶…"): live\'s heading is dropped, the raw heading follows in Node', () => {
    const labelRaw = { text: '§Psalms 1–41§¶Blessed', headings: { heading: 'The Divine Shepherd', last: 14242 } };
    const liveL = page(stale, '§Psalms 1–41', ['◀ Psalms 22', 'Psalms 24 ▶'], ['      <div class="passage ver_NRSV">', ...own]);
    const nodeL = page([], '§Psalms 1–41', ['◀ Psalms 22', 'Psalms 24 ▶'], ['      <div class="passage ver_NRSV">', ...own]);
    expect(staleSectionHeading(liveL, nodeL, labelRaw)).toBe(nodeL);
    expect(staleSectionHeading(liveL, nodeL.replace('"The Divine Shepherd"', '"Other"'), labelRaw)).toBeNull();
  });
  test('in the api "output" HTML', () => {
    const json = out => 'STATUS 200\n' + JSON.stringify({ input: 'ps.23', output: out.split('\n').slice(3).join('\n') }, null, 1);
    expect(staleSectionVerse(json(live))).toEqual({ version: 'NRSV', verseId: 14237 });
    expect(staleSectionHeading(json(live), json(node), raw)).toBe(json(node));
    expect(staleSectionHeading(json(live), json(node).replace('ps.23', 'ps.24'), raw)).not.toBe(json(node).replace('ps.23', 'ps.24'));
  });
});

describe('singleHeadingDrops', () => {
  const span = (id, text) => `  <span class="verse v_${id} prose" verse_id="${id}">\n    "${text}"`;
  const p = '<p class="prose">';
  const node = ['STATUS 200', '<h3 class="heading" ref="Genesis 1">', '  "Genesis 1"', p, span(31, 'very good.'),
    '<div class="summary" version="LDS">', '  "The Creation is completed"', p, span(32, 'Thus the heavens'), p, span(33, 'And on the seventh day')].join('\n');
  // passage_script.php drops the first verse of every later section, and its extras
  const live = ['STATUS 200', '<h3 class="heading" ref="Genesis 1">', '  "Genesis 1"', p, span(31, 'very good.'), p, span(33, 'And on the seventh day')].join('\n');
  test('live is Node without the first verse (and its extras) of later sections', () => {
    expect(singleHeadingDrops(live, node)).toBe(true);
  });
  test('not when they are equal: nothing was dropped', () => expect(singleHeadingDrops(node, node)).toBe(false));
  test('not when live has a line Node lacks', () => {
    expect(singleHeadingDrops(live.replace('very good.', 'very bad.'), node)).toBe(false);
  });
  test('not when Node has another kind of extra line', () => {
    expect(singleHeadingDrops(live, node.replace('<div class="summary" version="LDS">', '<h3 class="heading" ref="Genesis 2">'))).toBe(false);
  });
  // A later section's first verse starts a paragraph between verses live shows
  describe('not for a verse that cannot be a later section\'s first', () => {
    const v = (id, t) => `  <span class="verse v_${id} prose" verse_id="${id}">\n    "${t}"`;
    const base = ['STATUS 200', '<h3 class="heading">', p, v(1, 'a'), v(2, 'b')];
    const live2 = base.join('\n');
    test('after the last live verse', () => expect(singleHeadingDrops(live2, [...base, v(3, 'c')].join('\n'))).toBe(false));
    test('after a paragraph tag past the last live verse', () => expect(singleHeadingDrops(live2, [...base, p, v(3, 'c')].join('\n'))).toBe(false));
    test('before the first live verse', () => expect(singleHeadingDrops(live2, ['STATUS 200', '<h3 class="heading">', p, v(0, 'z'), v(1, 'a'), v(2, 'b')].join('\n'))).toBe(false));
    test('inside a paragraph', () => expect(singleHeadingDrops(live2, ['STATUS 200', '<h3 class="heading">', p, v(1, 'a'), v(9, 'dup'), v(2, 'b')].join('\n'))).toBe(false));
  });
  test('a dropped verse whose paragraph tag live gave to the next verse (KJV Matthew 1:1)', () => {
    const v = (id, t) => `  <span class="verse v_${id} prose" verse_id="${id}">\n    "${t}"`;
    const n = ['STATUS 200', '<h3 class="heading">', p, v(1, 'a'), p, v(2, 'b'), p, v(3, 'c')].join('\n');
    const l = ['STATUS 200', '<h3 class="heading">', p, v(1, 'a'), p, v(3, 'c')].join('\n');
    expect(singleHeadingDrops(l, n)).toBe(true);
  });
  test('not when a dropped run holds more than one verse', () => {
    const more = node.replace(span(32, 'Thus the heavens'), `${span(32, 'Thus the heavens')}\n${span(32.5, 'and all the host')}`);
    expect(singleHeadingDrops(live, more)).toBe(false);
  });
});
