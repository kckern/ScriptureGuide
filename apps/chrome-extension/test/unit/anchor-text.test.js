import { collectCandidates } from '../../src/content/detect.js';
import { annotateTextNode, removeAllAnnotations } from '../../src/content/annotate.js';

const body = (html) => { document.body.innerHTML = html; return document.body; };

// Trimmed from a shreddit feed card: the title and preview are each one long <a>.
const CARD = `<shreddit-post>
  <a slot="full-post-link" class="absolute inset-0" href="/r/x/comments/1/"><faceplate-screen-reader-content>In 2 Nephi 31:12, we read that the gift of the Holy Ghost was given to Jesus Christ - why was that necessary?</faceplate-screen-reader-content></a>
  <a href="/r/x/comments/1/" slot="title">In 2 Nephi 31:12, we read that the gift of the Holy Ghost was given to Jesus Christ - why was that necessary?</a>
</shreddit-post>`;

describe('text inside long anchors', () => {
  test('a long headline anchor is a candidate', () => {
    const nodes = collectCandidates(body(CARD), new WeakSet());
    expect(nodes.length).toBe(2);
  });

  test('a short reference-like anchor is still left to the footnote path', () => {
    expect(collectCandidates(body('<a href="/x">John 3:16</a>'), new WeakSet())).toEqual([]);
  });

  test('annotates with a span, never an <a> inside an <a>', () => {
    const b = body(CARD);
    const node = b.querySelector('a[slot="title"]').firstChild;
    const text = node.nodeValue;
    const start = text.indexOf('2 Nephi 31:12');
    const { links } = annotateTextNode(node, [{ start, end: start + 13, ref: '2 Nephi 31:12' }], new WeakSet());
    expect(links[0].tagName).toBe('SPAN');
    expect(links[0].getAttribute('data-href')).toContain('https://scripture.guide/');
    expect(links[0].closest('a[slot="title"]')).not.toBeNull();
    expect(b.querySelectorAll('a a').length).toBe(0);
    removeAllAnnotations(b);
    expect(b.querySelector('a[slot="title"]').textContent.trim()).toMatch(/^In 2 Nephi 31:12, we read/);
    expect(b.querySelector('.sg_autolink')).toBeNull();
  });

  test('plain text still gets a real <a>', () => {
    const b = body('<p>Read John 3:16 now</p>');
    const node = b.querySelector('p').firstChild;
    const { links } = annotateTextNode(node, [{ start: 5, end: 15, ref: 'John 3:16' }], new WeakSet());
    expect(links[0].tagName).toBe('A');
  });
});

describe('product titles', () => {
  test('Amazon product title is skipped', () => {
    const html = '<span id="productTitle">ApoloSign 32 Inch TV for Home, Office - Gen2 with 15000mAh Battery</span>';
    expect(collectCandidates(body(html), new WeakSet())).toEqual([]);
  });
});
