/**
 * Integration: real parser (dev-linked scripture-guide) + the DOM modules,
 * exercising the same flow content/index.js orchestrates, minus chrome.* glue.
 */
import { findReferences } from 'scripture-guide';
import { collectCandidates } from '../../src/content/detect.js';
import { annotateTextNode } from '../../src/content/annotate.js';

function runPipeline(processed = new WeakSet()) {
  for (const node of collectCandidates(document.body, processed)) {
    if (processed.has(node)) continue;
    processed.add(node);
    const matches = findReferences(node.nodeValue, { contextAware: true });
    if (matches.length) annotateTextNode(node, matches, processed);
  }
}

test('links references in prose and leaves surrounding text intact', () => {
  document.body.innerHTML =
    '<article><p>Jesus taught in John 3:16 about love, echoing Genesis 1:1.</p>' +
    '<p>Nothing citable in this sentence.</p></article>';
  runPipeline();
  const links = [...document.querySelectorAll('a.sg_autolink')];
  const byText = links.map((a) => a.textContent);
  expect(byText).toEqual(expect.arrayContaining(['John 3:16', 'Genesis 1:1']));
  const john = links.find((a) => a.textContent === 'John 3:16');
  expect(john.getAttribute('href')).toBe('https://scripture.guide/john.3.16');
  // full visible text preserved
  expect(document.querySelector('article').textContent)
    .toContain('Jesus taught in John 3:16 about love, echoing Genesis 1:1.');
  // second paragraph untouched
  expect(document.querySelectorAll('p')[1].querySelector('a')).toBeNull();
});

test('does not double-link on a second pass (idempotent via processed set + skip-selector)', () => {
  document.body.innerHTML = '<p>Read Alma 32:21 today.</p>';
  const processed = new WeakSet();
  runPipeline(processed);
  runPipeline(processed);
  expect(document.querySelectorAll('a.sg_autolink')).toHaveLength(1);
});

test('does not descend into an existing anchor', () => {
  document.body.innerHTML = '<p>See <a href="/x">John 3:16</a> here.</p>';
  runPipeline();
  // the only anchor is the pre-existing one; no sg_autolink created inside it
  expect(document.querySelectorAll('a.sg_autolink')).toHaveLength(0);
});


import { collectAnchorGroups, annotateAnchor } from '../../src/content/footnotes.js';

test('back-to-back reference anchors merge into one combined 🔗 link', () => {
  document.body.innerHTML =
    '<li><a href="/byu/1">Isa. 44:13</a>; <a href="/byu/2">1 Ne. 18:12,21</a>; <a href="/byu/3">Alma 37:43-44</a></li>';
  const groups = collectAnchorGroups(document.body);
  expect(groups.length).toBe(1);
  const combined = [];
  for (const anchor of groups[0]) combined.push(...findReferences(anchor.textContent, { contextAware: true }));
  const link = annotateAnchor(groups[0][groups[0].length - 1], combined);
  // exactly one 🔗, after the last anchor, covering all three refs
  expect(document.querySelectorAll('a.sg_reflink').length).toBe(1);
  expect(groups[0][2].nextElementSibling).toBe(link);
  const href = link.getAttribute('href');
  expect(href).toContain('isaiah.44.13');
  expect(href).toContain('1.nephi.18.12;18.21');
  expect(href).toContain('alma.37.43-44');
  // the three original page links are untouched
  expect(document.querySelectorAll('a[href^="/byu"]').length).toBe(3);
});
