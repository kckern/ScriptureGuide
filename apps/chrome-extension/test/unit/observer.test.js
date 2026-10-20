import { createObserver } from '../../src/content/observer.js';

const flush = (ms) => new Promise((r) => setTimeout(r, ms));

describe('createObserver', () => {
  test('reports text nodes of newly added elements, debounced and accumulated', async () => {
    document.body.innerHTML = '';
    const batches = [];
    const obs = createObserver(document.body, (nodes) => batches.push(nodes), { debounceMs: 20 });
    const p1 = document.createElement('p'); p1.textContent = 'John 3:16';
    document.body.appendChild(p1);
    await flush(5);
    const p2 = document.createElement('p'); p2.textContent = 'Alma 32:21';
    document.body.appendChild(p2);
    await flush(50);
    expect(batches).toHaveLength(1);
    expect(batches[0].map((n) => n.nodeValue).sort()).toEqual(['Alma 32:21', 'John 3:16']);
    obs.disconnect();
  });

  test('ignores our own sg_autolink insertions', async () => {
    document.body.innerHTML = '<p></p>';
    const batches = [];
    const obs = createObserver(document.body, (nodes) => batches.push(nodes), { debounceMs: 20 });
    const a = document.createElement('a');
    a.className = 'sg_autolink'; a.textContent = 'John 3:16';
    document.querySelector('p').appendChild(a);
    await flush(50);
    expect(batches).toHaveLength(0);
    obs.disconnect();
  });

  test('characterData change re-reports the node', async () => {
    document.body.innerHTML = '<p>plain text 123456</p>';
    const tn = document.querySelector('p').firstChild;
    const batches = [];
    const obs = createObserver(document.body, (nodes) => batches.push(nodes), { debounceMs: 20 });
    tn.nodeValue = 'now reads John 3:16';
    await flush(50);
    expect(batches[0]).toContain(tn);
    obs.disconnect();
  });
});
