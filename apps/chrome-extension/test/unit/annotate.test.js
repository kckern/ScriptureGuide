import { annotateTextNode, removeAllAnnotations } from '../../src/content/annotate.js';

describe('annotateTextNode', () => {
  test('wraps match in <a>, preserves surrounding text and sibling elements', () => {
    document.body.innerHTML = '<p><b>Bold</b>Read John 3:16 now<i>It</i></p>';
    const p = document.querySelector('p');
    const textNode = p.childNodes[1];
    const { links } = annotateTextNode(textNode,
      [{ start: 5, end: 14, text: 'John 3:16', ref: 'John 3:16', verse_ids: [26137] }],
      new WeakSet());
    expect(p.textContent).toBe('BoldRead John 3:16 now' + 'It');
    const a = p.querySelector('a.sg_autolink');
    expect(a.textContent).toBe('John 3:16');
    expect(a.getAttribute('href')).toBe('https://scripture.guide/john.3.16');
    expect(p.querySelector('b')).not.toBeNull();
    expect(p.querySelector('i')).not.toBeNull();
    expect(links).toHaveLength(1);
  });

  test('multiple + adjacent matches; created text nodes marked processed', () => {
    document.body.innerHTML = '<p>Gen 1:1 and John 3:16</p>';
    const tn = document.querySelector('p').firstChild;
    const processed = new WeakSet();
    annotateTextNode(tn, [
      { start: 0, end: 7, text: 'Gen 1:1', ref: 'Genesis 1:1', verse_ids: [1] },
      { start: 12, end: 21, text: 'John 3:16', ref: 'John 3:16', verse_ids: [26137] }
    ], processed);
    const p = document.querySelector('p');
    expect(p.querySelectorAll('a.sg_autolink')).toHaveLength(2);
    expect(p.textContent).toBe('Gen 1:1 and John 3:16');
    for (const n of p.childNodes) if (n.nodeType === 3) expect(processed.has(n)).toBe(true);
  });

  test('HTML-special characters in text survive verbatim (the old innerHTML bug)', () => {
    document.body.innerHTML = '<p></p>';
    const p = document.querySelector('p');
    const tn = document.createTextNode('Q&A <not html> about John 3:16 & more');
    p.appendChild(tn);
    annotateTextNode(tn, [{ start: 21, end: 30, text: 'John 3:16', ref: 'John 3:16', verse_ids: [26137] }], new WeakSet());
    expect(p.textContent).toBe('Q&A <not html> about John 3:16 & more');
  });

  test('event listeners on ancestor survive annotation', () => {
    document.body.innerHTML = '<div id="app"><p>John 3:16</p></div>';
    let clicks = 0;
    document.getElementById('app').addEventListener('click', () => clicks++);
    annotateTextNode(document.querySelector('p').firstChild,
      [{ start: 0, end: 9, text: 'John 3:16', ref: 'John 3:16', verse_ids: [26137] }], new WeakSet());
    document.querySelector('a.sg_autolink').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicks).toBe(1);
  });

  test('out-of-bounds / overlapping matches are skipped safely', () => {
    document.body.innerHTML = '<p>John 3:16</p>';
    const tn = document.querySelector('p').firstChild;
    const { links } = annotateTextNode(tn, [
      { start: 0, end: 9, text: 'John 3:16', ref: 'John 3:16', verse_ids: [26137] },
      { start: 5, end: 9, text: '3:16', ref: 'x', verse_ids: [1] }, // overlaps previous
      { start: 0, end: 999, text: 'x', ref: 'x', verse_ids: [1] }    // out of bounds
    ], new WeakSet());
    expect(links).toHaveLength(1);
  });

  test('removeAllAnnotations restores plain text', () => {
    document.body.innerHTML = '<p>Read John 3:16 now</p>';
    annotateTextNode(document.querySelector('p').firstChild,
      [{ start: 5, end: 14, text: 'John 3:16', ref: 'John 3:16', verse_ids: [26137] }], new WeakSet());
    removeAllAnnotations(document);
    expect(document.querySelector('p').textContent).toBe('Read John 3:16 now');
    expect(document.querySelector('a.sg_autolink')).toBeNull();
  });
});
