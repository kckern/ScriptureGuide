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
