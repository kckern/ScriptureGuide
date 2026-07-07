import { collectAnchorCandidates, annotateAnchor, removeAllReflinks } from '../../src/content/footnotes.js';

const body = (html) => { document.body.innerHTML = html; return document.body; };

describe('collectAnchorCandidates', () => {
  test('picks anchors whose text has a digit and a letter, short enough', () => {
    const b = body('<a href="/a">D&C 8:11</a><a href="/b">Home</a><a href="/c">1234</a>');
    const got = collectAnchorCandidates(b).map((a) => a.textContent);
    expect(got).toEqual(['D&C 8:11']);
  });
  test('skips our own sg elements and already-marked anchors', () => {
    const b = body('<a class="sg_autolink" href="/x">John 3:16</a><a class="sg_reflink">🔗</a>' +
      '<a href="/y" data-sg-reflinked="true">Alma 5:1</a>');
    expect(collectAnchorCandidates(b)).toEqual([]);
  });
  test('skips paragraph-length anchor text', () => {
    const b = body('<a href="/x">' + 'word 1 '.repeat(20) + '</a>');
    expect(collectAnchorCandidates(b)).toEqual([]);
  });
});

describe('annotateAnchor', () => {
  test('appends a 🔗 sibling linking to scripture.guide, keeps the original link', () => {
    document.body.innerHTML = '<p><a id="fn" href="/byu/dc8">D&C 8:11</a> text</p>';
    const anchor = document.getElementById('fn');
    const link = annotateAnchor(anchor, [{ ref: 'D&C 8:11', verse_ids: [1] }]);
    // original untouched
    expect(anchor.getAttribute('href')).toBe('/byu/dc8');
    expect(anchor.textContent).toBe('D&C 8:11');
    // 🔗 appended right after
    expect(anchor.nextElementSibling).toBe(link);
    expect(link.className).toBe('sg_reflink');
    expect(link.querySelector('svg')).not.toBeNull();
    expect(link.getAttribute('href')).toBe('https://scripture.guide/' + require('../../src/shared/slug.js').refToSlug('D&C 8:11'));
    expect(anchor.hasAttribute('data-sg-reflinked')).toBe(true);
  });

  test('joins multiple detected refs into one 🔗', () => {
    document.body.innerHTML = '<a id="fn" href="/x">JS-H 1:34; 1 Ne. 5:14</a>';
    const anchor = document.getElementById('fn');
    const link = annotateAnchor(anchor, [{ ref: 'JS-H 1:34' }, { ref: '1 Nephi 5:14' }]);
    expect(link.getAttribute('title')).toContain('JS-H 1:34; 1 Nephi 5:14');
  });

  test('is idempotent — second call does nothing', () => {
    document.body.innerHTML = '<a id="fn" href="/x">Alma 5:1</a>';
    const anchor = document.getElementById('fn');
    annotateAnchor(anchor, [{ ref: 'Alma 5:1' }]);
    const before = document.querySelectorAll('a.sg_reflink').length;
    annotateAnchor(anchor, [{ ref: 'Alma 5:1' }]);
    expect(document.querySelectorAll('a.sg_reflink').length).toBe(before);
  });

  test('removeAllReflinks strips the 🔗 and the marks', () => {
    document.body.innerHTML = '<a id="fn" href="/x">Alma 5:1</a>';
    annotateAnchor(document.getElementById('fn'), [{ ref: 'Alma 5:1' }]);
    removeAllReflinks(document);
    expect(document.querySelector('a.sg_reflink')).toBeNull();
    expect(document.querySelector('[data-sg-reflinked]')).toBeNull();
  });
});

describe('collectAnchorCandidates root inclusion (review fix)', () => {
  test('includes the root element itself when it is a candidate anchor', () => {
    const { collectAnchorCandidates } = require('../../src/content/footnotes.js');
    document.body.innerHTML = '<a id="fn" href="/x">D&C 8:11</a>';
    const root = document.getElementById('fn');
    expect(collectAnchorCandidates(root).map((a) => a.id)).toEqual(['fn']);
  });
});

describe('collectAnchorGroups', () => {
  const { collectAnchorGroups } = require('../../src/content/footnotes.js');
  const body = (html) => { document.body.innerHTML = html; return document.body; };

  test('groups back-to-back reference anchors separated by ";"', () => {
    const b = body('<li><a href="/a">D&C 28:7</a>; <a href="/b">D&C 64:5</a></li>');
    const groups = collectAnchorGroups(b).map((g) => g.map((a) => a.textContent));
    expect(groups).toEqual([['D&C 28:7', 'D&C 64:5']]);
  });

  test('groups three separated by ";" and ","', () => {
    const b = body('<li><a href="/1">Isa. 44:13</a>; <a href="/2">1 Ne. 18:12,21</a>; <a href="/3">Alma 37:43-44</a></li>');
    expect(collectAnchorGroups(b)[0].length).toBe(3);
  });

  test('a lone reference is its own singleton group', () => {
    const b = body('<li><a href="/a">D&C 1:17</a></li>');
    expect(collectAnchorGroups(b).map((g) => g.length)).toEqual([1]);
  });

  test('anchors in separate list items are NOT grouped', () => {
    const b = body('<ol><li><a href="/a">D&C 28:7</a></li><li><a href="/b">2 Pet. 1:11</a></li></ol>');
    expect(collectAnchorGroups(b).map((g) => g.length)).toEqual([1, 1]);
  });

  test('a non-joiner element between anchors breaks the run', () => {
    const b = body('<li><a href="/a">D&C 28:7</a> and see <span>note</span> <a href="/b">D&C 64:5</a></li>');
    expect(collectAnchorGroups(b).map((g) => g.length)).toEqual([1, 1]);
  });

  test('prose words between anchors break the run', () => {
    const b = body('<p><a href="/a">Matt. 4:4</a> which quotes <a href="/b">Deut. 8:3</a></p>');
    expect(collectAnchorGroups(b).map((g) => g.length)).toEqual([1, 1]);
  });
});
