import { collectAnchorCandidates, annotateAnchor, removeAllReflinks, isWholeReference, takeOverAnchor } from '../../src/content/footnotes.js';

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
    expect(link.getAttribute('href')).toBe('https://scripture.guide/' + require('scripture-guide').toSlug('D&C 8:11'));
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

describe('annotateAnchor after caller-marking (real-flow regression)', () => {
  test('still appends a 🔗 when the anchor was already MARK-ed by the caller', () => {
    const { annotateAnchor, MARK } = require('../../src/content/footnotes.js');
    document.body.innerHTML = '<li><a id="fn" href="/x">D&C 28:7</a></li>';
    const anchor = document.getElementById('fn');
    anchor.setAttribute(MARK, 'true'); // processGroup marks every anchor first
    const link = annotateAnchor(anchor, [{ ref: 'Doctrine and Covenants 28:7' }]);
    expect(link).not.toBeNull();
    expect(document.querySelectorAll('a.sg_reflink').length).toBe(1);
  });
});

describe('taking over a link whose whole text is a reference', () => {
  const setup = (html) => { document.body.innerHTML = html; return document.querySelector('a'); };

  test('isWholeReference: the match must be all of the link text, apart from brackets and punctuation', () => {
    expect(isWholeReference('Acts 4:12', { start: 0, end: 9 })).toBe(true);
    expect(isWholeReference('(John 3:16).', { start: 1, end: 10 })).toBe(true);
    expect(isWholeReference(' Matthew 28:18, 19 ', { start: 1, end: 18 })).toBe(true);
    expect(isWholeReference('see Acts 4:12 here', { start: 4, end: 13 })).toBe(false);
    expect(isWholeReference('Acts 4:12', null)).toBe(false);
  });

  test('replaces the link with a badge to scripture.guide and keeps the original as an icon link', () => {
    const a = setup('<p>saved.”—<a class="jsBibleLink" href="/en/bible/acts/4/#v44004012" target="_blank">Acts 4:12</a>.</p>');
    takeOverAnchor(a, { start: 0, end: 9, ref: 'Acts 4:12' });
    const p = document.querySelector('p');
    const badge = p.querySelector('a.sg_autolink');
    expect(badge.textContent).toBe('Acts 4:12');
    expect(badge.getAttribute('href')).toBe('https://scripture.guide/acts.4.12');
    expect(badge.classList.contains('jsBibleLink')).toBe(false);
    const orig = badge.nextElementSibling;
    expect(orig.classList.contains('sg_origlink')).toBe(true);
    expect(orig.getAttribute('href')).toBe('/en/bible/acts/4/#v44004012');
    expect(orig.getAttribute('target')).toBe('_blank');
    expect(orig.getAttribute('aria-label')).toBe('Open the original link for Acts 4:12');
    expect(orig.querySelector('svg')).not.toBeNull();
    expect(orig.textContent).toBe('');
    expect(p.querySelector('a.jsBibleLink')).toBeNull();
    expect(p.textContent).toBe('saved.”—Acts 4:12.');
  });

  test('turning the site off restores the original link', () => {
    const a = setup('<p>See <a class="jsBibleLink" href="/x">Acts 4:12</a>.</p>');
    takeOverAnchor(a, { start: 0, end: 9, ref: 'Acts 4:12' });
    removeAllReflinks(document);
    const p = document.querySelector('p');
    expect(p.querySelector('.sg_autolink, .sg_origlink')).toBeNull();
    expect(p.querySelector('a.jsBibleLink').getAttribute('href')).toBe('/x');
    expect(p.innerHTML).toBe('See <a class="jsBibleLink" href="/x">Acts 4:12</a>.');
  });

  test('our icon links are never candidates themselves', () => {
    const a = setup('<p><a href="/x">Acts 4:12</a></p>');
    takeOverAnchor(a, { start: 0, end: 9, ref: 'Acts 4:12' });
    expect(collectAnchorCandidates(document.body)).toEqual([]);
  });
});
