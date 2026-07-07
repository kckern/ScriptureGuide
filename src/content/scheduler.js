// Idle-time processing queue. Drains items via requestIdleCallback (yielding
// when the frame's idle budget runs low) with a setTimeout fallback where
// requestIdleCallback is unavailable. A hard node cap stops runaway scans on
// pathological pages.

export function createQueue(processFn, { chunkBudgetMs = 8, maxNodes = 50000 } = {}) {
  const queue = [];
  let scheduled = false;
  let processedCount = 0;
  let stopped = false;

  const scheduleTick = (typeof requestIdleCallback === 'function')
    ? (cb) => requestIdleCallback(cb, { timeout: 1000 })
    : (cb) => setTimeout(() => cb(null), 0);

  function pump(deadline) {
    scheduled = false;
    const start = Date.now();
    while (queue.length && !stopped) {
      const outOfTime = deadline && typeof deadline.timeRemaining === 'function'
        ? deadline.timeRemaining() < 2
        : (Date.now() - start) > chunkBudgetMs;
      if (outOfTime) break;

      processFn(queue.shift());
      if (++processedCount >= maxNodes) {
        stopped = true;
        queue.length = 0;
        console.info('[Scripture Guide] scan budget reached; stopping');
        return;
      }
    }
    if (queue.length && !stopped) schedule();
  }

  function schedule() {
    if (!scheduled && !stopped) {
      scheduled = true;
      scheduleTick(pump);
    }
  }

  return {
    push(items) { if (!stopped && items && items.length) { queue.push(...items); schedule(); } },
    pushFront(items) { if (!stopped && items && items.length) { queue.unshift(...items); schedule(); } },
    stop() { stopped = true; queue.length = 0; },
    get size() { return queue.length; },
    get isStopped() { return stopped; }
  };
}
