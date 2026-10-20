import { createQueue } from '../../src/content/scheduler.js';

describe('createQueue (setTimeout fallback path)', () => {
  const noIdle = () => { global.requestIdleCallback = undefined; };
  beforeEach(() => { jest.useFakeTimers(); noIdle(); });
  afterEach(() => { jest.useRealTimers(); });

  test('drains asynchronously; pushFront items processed first', () => {
    const seen = [];
    const q = createQueue((x) => seen.push(x));
    q.push([1, 2, 3]);
    q.pushFront([0]);
    expect(seen).toEqual([]);         // nothing synchronous
    jest.runAllTimers();
    expect(seen).toEqual([0, 1, 2, 3]);
  });

  test('hard maxNodes cap stops processing and stays stopped', () => {
    const seen = [];
    const q = createQueue((x) => seen.push(x), { maxNodes: 2 });
    q.push([1, 2, 3, 4]);
    jest.runAllTimers();
    expect(seen).toEqual([1, 2]);
    expect(q.isStopped).toBe(true);
    q.push([5]);
    jest.runAllTimers();
    expect(seen).toEqual([1, 2]);
  });

  test('stop() clears the queue', () => {
    const seen = [];
    const q = createQueue((x) => seen.push(x));
    q.push([1, 2]);
    q.stop();
    jest.runAllTimers();
    expect(seen).toEqual([]);
  });
});
