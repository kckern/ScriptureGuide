// Debounced MutationObserver for dynamically added/changed content. Accumulates
// affected text nodes across mutation callbacks and flushes them as one batch
// after a quiet period. Our own <a class="sg_autolink"> insertions are ignored
// so the observer never feeds on its own output.

export function createObserver(target, onTextNodes, { debounceMs = 250 } = {}) {
  const doc = target.ownerDocument || document;
  let pending = new Set();
  let timer = null;

  const collectTextNodes = (el) => {
    const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = walker.nextNode())) pending.add(t);
  };

  const isOwnAnnotation = (node) =>
    node.nodeType === 1 && node.classList && node.classList.contains('sg_autolink');

  const flushSoon = () => {
    if (!pending.size) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const batch = [...pending];
      pending = new Set();
      onTextNodes(batch);
    }, debounceMs);
  };

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'characterData') {
        pending.add(m.target);
        continue;
      }
      for (const node of m.addedNodes) {
        if (node.nodeType === 3 /* TEXT_NODE */) {
          pending.add(node);
        } else if (node.nodeType === 1 /* ELEMENT_NODE */) {
          if (isOwnAnnotation(node)) continue;
          collectTextNodes(node);
        }
      }
    }
    flushSoon();
  });

  observer.observe(target, { childList: true, subtree: true, characterData: true });
  return {
    disconnect() { clearTimeout(timer); observer.disconnect(); }
  };
}
