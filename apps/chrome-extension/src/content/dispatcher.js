// Sends text to the background worker for parsing, batched, with one request in flight per
// tab. A batch that errors or gets no reply within timeoutMs is parsed on the page thread
// instead, one chunk per idle slice, and counts as a worker failure. In the local and lite
// states everything is parsed that way; paused drops work.
//
// A job is { chunks: [text...], onResult(resultsPerChunk) }.

import { guardMatches } from './guard.js';

export function createDispatcher({
  send, parseLocal, governor, idle, options,
  timeoutMs = 2000, maxBatchChars = 16000, now = () => performance.now()
}) {
  const waiting = [];
  let inFlight = false;
  let scheduled = false;
  const localQueue = []; // { job, results, next }
  let localScheduled = false;

  const pumpLocal = () => {
    localScheduled = false;
    const item = localQueue[0];
    if (!item) return;
    if (!governor.canParse) { localQueue.length = 0; return; }
    const start = now();
    let matches = [];
    try { matches = parseLocal(item.job.chunks[item.next], { ...options(), contextAware: governor.contextAware && options().contextAware !== false }) || []; } catch (e) { matches = []; }
    governor.recordLocal(now() - start);
    item.results.push(guardMatches(item.job.chunks[item.next], matches));
    item.next++;
    if (item.next >= item.job.chunks.length) {
      localQueue.shift();
      item.job.onResult(item.results);
    }
    if (localQueue.length && !localScheduled) { localScheduled = true; idle(pumpLocal); }
  };

  const parseOnPage = (jobs) => {
    for (const job of jobs) localQueue.push({ job, results: [], next: 0 });
    if (localQueue.length && !localScheduled) { localScheduled = true; idle(pumpLocal); }
  };

  const takeBatch = () => {
    const batch = [];
    let size = 0;
    while (waiting.length) {
      const job = waiting[0];
      const jobSize = job.chunks.reduce((n, c) => n + c.length, 0);
      if (batch.length && size + jobSize > maxBatchChars) break;
      batch.push(waiting.shift());
      size += jobSize;
    }
    return batch;
  };

  const flush = () => {
    scheduled = false;
    if (inFlight || !waiting.length) return;
    if (!governor.canParse) { waiting.length = 0; return; }
    if (governor.state !== 'normal') { parseOnPage(waiting.splice(0)); return; }

    const batch = takeBatch();
    inFlight = true;
    let settled = false;
    const finish = (results) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      inFlight = false;
      if (results) {
        governor.workerOk();
        let i = 0;
        for (const job of batch) {
          job.onResult(results.slice(i, i + job.chunks.length).map((r, k) => guardMatches(job.chunks[k], r)));
          i += job.chunks.length;
        }
      } else {
        governor.workerFailed();
        parseOnPage(batch);
      }
      if (waiting.length) schedule();
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    const chunks = batch.flatMap((job) => job.chunks);
    Promise.resolve()
      .then(() => send({ type: 'sg-parse', chunks, options: { ...options(), contextAware: governor.contextAware && options().contextAware !== false } }))
      .then((reply) => finish(reply && Array.isArray(reply.results) && reply.results.length === chunks.length ? reply.results : null))
      .catch(() => finish(null));
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    Promise.resolve().then(flush);
  };

  return {
    submit(job) {
      if (!governor.canParse || !job.chunks.length) return;
      waiting.push(job);
      schedule();
    },
    get pending() { return waiting.length + localQueue.length + (inFlight ? 1 : 0); }
  };
}
