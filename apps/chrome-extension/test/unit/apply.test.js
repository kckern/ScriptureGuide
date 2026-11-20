import { applyResult } from '../../src/content/apply.js';

describe('applyResult', () => {
  test('links matches at node offsets', () => {
    document.body.innerHTML = '<p>Intro. Then John 3:16 here.</p>';
    const node = document.querySelector('p').firstChild;
    const text = node.nodeValue;
    const chunks = [{ offset: 0, text: 'Intro. ' }, { offset: 7, text: 'Then John 3:16 here.' }];
    const ok = applyResult(node, text, chunks, [[], [{ start: 5, end: 14, ref: 'John 3:16' }]], new WeakSet());
    expect(ok).toBe(true);
    expect(document.querySelector('a.sg_autolink').textContent).toBe('John 3:16');
    expect(document.querySelector('p').textContent).toBe(text);
  });
  test('a node whose text changed is left alone and reported stale', () => {
    document.body.innerHTML = '<p>John 3:16</p>';
    const node = document.querySelector('p').firstChild;
    const chunks = [{ offset: 0, text: 'John 3:16' }];
    node.nodeValue = 'Alma 32:21';
    expect(applyResult(node, 'John 3:16', chunks, [[{ start: 0, end: 9, ref: 'John 3:16' }]], new WeakSet())).toBe(false);
    expect(document.querySelector('a')).toBeNull();
  });
  test('a node removed from the page is reported stale', () => {
    document.body.innerHTML = '<p>John 3:16</p>';
    const node = document.querySelector('p').firstChild;
    node.remove();
    expect(applyResult(node, 'John 3:16', [{ offset: 0, text: 'John 3:16' }], [[]], new WeakSet())).toBe(false);
  });
});
