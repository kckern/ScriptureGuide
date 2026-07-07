import { createViewportScanner } from '../../src/content/lazy.js';

// Minimal controllable IntersectionObserver stand-in for jsdom.
function makeMockIO() {
  const instances = [];
  class MockIO {
    constructor(cb, opts) { this.cb = cb; this.opts = opts; this.observed = new Set(); instances.push(this); }
    observe(el) { this.observed.add(el); }
    unobserve(el) { this.observed.delete(el); }
    disconnect() { this.observed.clear(); }
    // test helper: fire intersection for given elements
    fire(els) { this.cb(els.map((target) => ({ target, isIntersecting: true }))); }
  }
  return { MockIO, instances };
}

describe('createViewportScanner', () => {
  test('does not run thunks until the element intersects', () => {
    const { MockIO, instances } = makeMockIO();
    document.body.innerHTML = '<p id="a">x</p><p id="b">y</p>';
    const ran = [];
    const scanner = createViewportScanner({ IOImpl: MockIO });
    const a = document.getElementById('a');
    const b = document.getElementById('b');
    scanner.add(a, () => ran.push('a'));
    scanner.add(b, () => ran.push('b'));
    expect(ran).toEqual([]);                 // nothing yet
    instances[0].fire([b]);                  // b scrolls into view
    expect(ran).toEqual(['b']);
    instances[0].fire([a]);
    expect(ran).toEqual(['b', 'a']);
  });

  test('each element runs at most once and is unobserved after firing', () => {
    const { MockIO, instances } = makeMockIO();
    document.body.innerHTML = '<p id="a">x</p>';
    const ran = [];
    const scanner = createViewportScanner({ IOImpl: MockIO });
    const a = document.getElementById('a');
    scanner.add(a, () => ran.push('a'));
    instances[0].fire([a]);
    instances[0].fire([a]);                  // second intersection ignored
    expect(ran).toEqual(['a']);
    expect(instances[0].observed.has(a)).toBe(false);
  });

  test('duplicate add for the same element is ignored', () => {
    const { MockIO, instances } = makeMockIO();
    document.body.innerHTML = '<p id="a">x</p>';
    const ran = [];
    const scanner = createViewportScanner({ IOImpl: MockIO });
    const a = document.getElementById('a');
    scanner.add(a, () => ran.push('first'));
    scanner.add(a, () => ran.push('second'));
    instances[0].fire([a]);
    expect(ran).toEqual(['first']);
  });

  test('falls back to running immediately when IntersectionObserver is absent', () => {
    document.body.innerHTML = '<p id="a">x</p>';
    const ran = [];
    const scanner = createViewportScanner({ IOImpl: null });
    scanner.add(document.getElementById('a'), () => ran.push('a'));
    expect(ran).toEqual(['a']);
  });

  test('runs immediately for a null / non-element target', () => {
    const { MockIO } = makeMockIO();
    const ran = [];
    const scanner = createViewportScanner({ IOImpl: MockIO });
    scanner.add(null, () => ran.push('x'));
    expect(ran).toEqual(['x']);
  });
});
