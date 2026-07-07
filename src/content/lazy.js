// Viewport-lazy scheduling: defer per-element work until the element scrolls
// near the viewport, so a huge page only pays for what the user actually looks
// at. Each registered element gets a thunk that runs once, when it first comes
// within `rootMargin` of the viewport. Falls back to running everything
// immediately where IntersectionObserver is unavailable (or when an element
// has no measurable box).

export function createViewportScanner(options = {}) {
  const rootMargin = options.rootMargin || '600px';
  const IO = options.IOImpl ||
    (typeof IntersectionObserver !== 'undefined' ? IntersectionObserver : null);

  // No IntersectionObserver: run thunks eagerly (correctness over laziness).
  if (!IO) {
    return {
      add(el, run) { run(); },
      disconnect() {}
    };
  }

  const thunks = new Map(); // element -> run()
  const observer = new IO((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target;
      const run = thunks.get(el);
      thunks.delete(el);
      observer.unobserve(el);
      if (run) run();
    }
  }, { rootMargin });

  return {
    add(el, run) {
      if (!el || el.nodeType !== 1) { run(); return; }
      if (thunks.has(el)) return; // already pending
      thunks.set(el, run);
      observer.observe(el);
    },
    disconnect() {
      observer.disconnect();
      thunks.clear();
    }
  };
}
