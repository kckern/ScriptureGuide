import { collectCandidates, isCandidate } from '../../src/content/detect.js';

const body = (html) => { document.body.innerHTML = html; return document.body; };

describe('collectCandidates', () => {
  test('finds plain text nodes with digits and length >= 6', () => {
    const nodes = collectCandidates(body('<p>Read John 3:16 now</p>'), new WeakSet());
    expect(nodes.map(n => n.nodeValue)).toEqual(['Read John 3:16 now']);
  });
  test('skips script/style/code/pre/a/textarea/contenteditable and sg_autolink', () => {
    const html = "<script>var x='John 3:16'</script><code>John 3:16</code><pre>John 3:16</pre>" +
      '<a href="/x">John 3:16</a><div contenteditable="">John 3:16</div>' +
      '<span class="sg_autolink">John 3:16</span><textarea>John 3:16</textarea>';
    expect(collectCandidates(body(html), new WeakSet())).toEqual([]);
  });
  test('skips digit-free and too-short nodes', () => {
    const nodes = collectCandidates(body('<p>no digits in this text</p><p>a1</p>'), new WeakSet());
    expect(nodes).toEqual([]);
  });
  test('skips already-processed nodes', () => {
    const b = body('<p>Read John 3:16 now</p>');
    const seen = new WeakSet();
    seen.add(b.querySelector('p').firstChild);
    expect(collectCandidates(b, seen)).toEqual([]);
  });
  test('contenteditable="false" is NOT skipped', () => {
    const nodes = collectCandidates(body('<div contenteditable="false">Read John 3:16 here</div>'), new WeakSet());
    expect(nodes.length).toBe(1);
  });
});

describe('isCandidate', () => {
  test('agrees with collectCandidates on a simple node', () => {
    const b = body('<p>Read John 3:16 now</p>');
    const tn = b.querySelector('p').firstChild;
    expect(isCandidate(tn, new WeakSet())).toBe(true);
  });
  test('false for element nodes and processed nodes', () => {
    const b = body('<p>Read John 3:16 now</p>');
    expect(isCandidate(b.querySelector('p'), new WeakSet())).toBe(false);
    const tn = b.querySelector('p').firstChild;
    const seen = new WeakSet(); seen.add(tn);
    expect(isCandidate(tn, seen)).toBe(false);
  });
});
