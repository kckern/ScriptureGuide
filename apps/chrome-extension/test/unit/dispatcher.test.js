import { createDispatcher } from '../../src/content/dispatcher.js';

const tick = () => new Promise((r) => setTimeout(r, 0));
const governor = (state = 'normal') => ({
  state, canParse: state !== 'paused', contextAware: state !== 'lite',
  workerFailed: jest.fn(), workerOk: jest.fn(), recordLocal: jest.fn()
});
const job = (chunks, onResult = jest.fn()) => ({ chunks, onResult });
const idle = (cb) => setTimeout(cb, 0);

describe('dispatcher', () => {
  test('sends jobs to the worker and returns results per chunk', async () => {
    const g = governor();
    const send = jest.fn(async (msg) => ({ results: msg.chunks.map((t) => [{ ref: t }]) }));
    const d = createDispatcher({ send, parseLocal: jest.fn(), governor: g, idle, options: () => ({ language: 'en' }) });
    const j = job(['a', 'b']);
    d.submit(j);
    await tick(); await tick();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ type: 'sg-parse', chunks: ['a', 'b'], options: { language: 'en' } });
    expect(j.onResult).toHaveBeenCalledWith([[{ ref: 'a' }], [{ ref: 'b' }]]);
    expect(g.workerOk).toHaveBeenCalled();
  });

  test('batches jobs submitted together into one message', async () => {
    const send = jest.fn(async (msg) => ({ results: msg.chunks.map(() => []) }));
    const d = createDispatcher({ send, parseLocal: jest.fn(), governor: governor(), idle, options: () => ({}) });
    d.submit(job(['a'])); d.submit(job(['b']));
    await tick(); await tick();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].chunks).toEqual(['a', 'b']);
  });

  test('keeps one request in flight', async () => {
    let release;
    const send = jest.fn((msg) => new Promise((r) => { release = () => r({ results: msg.chunks.map(() => []) }); }));
    const d = createDispatcher({ send, parseLocal: jest.fn(), governor: governor(), idle, options: () => ({}) });
    d.submit(job(['a']));
    await tick();
    d.submit(job(['b']));
    await tick();
    expect(send).toHaveBeenCalledTimes(1);
    release();
    await tick(); await tick();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].chunks).toEqual(['b']);
  });

  test('a batch over the size limit is split across messages', async () => {
    const send = jest.fn(async (msg) => ({ results: msg.chunks.map(() => []) }));
    const d = createDispatcher({ send, parseLocal: jest.fn(), governor: governor(), idle, options: () => ({}), maxBatchChars: 10 });
    d.submit(job(['123456'])); d.submit(job(['abcdef']));
    for (let i = 0; i < 6; i++) await tick();
    expect(send.mock.calls.map((c) => c[0].chunks)).toEqual([['123456'], ['abcdef']]);
  });

  test('no reply in time: parse on the page thread and count a worker failure', async () => {
    jest.useFakeTimers();
    const g = governor();
    const send = jest.fn(() => new Promise(() => {}));
    const parseLocal = jest.fn((text) => [{ ref: text }]);
    const d = createDispatcher({ send, parseLocal, governor: g, idle: (cb) => setTimeout(cb, 0), options: () => ({}), timeoutMs: 2000 });
    const j = job(['a', 'b']);
    d.submit(j);
    await jest.advanceTimersByTimeAsync(2100);
    expect(g.workerFailed).toHaveBeenCalledTimes(1);
    expect(j.onResult).toHaveBeenCalledWith([[{ ref: 'a' }], [{ ref: 'b' }]]);
    expect(g.recordLocal).toHaveBeenCalled();
    jest.useRealTimers();
  });

  test('a worker error also falls back to the page thread', async () => {
    const g = governor();
    const send = jest.fn(async () => { throw new Error('no receiver'); });
    const j = job(['a']);
    createDispatcher({ send, parseLocal: (t) => [{ ref: t }], governor: g, idle, options: () => ({}) }).submit(j);
    for (let i = 0; i < 5; i++) await tick();
    expect(g.workerFailed).toHaveBeenCalled();
    expect(j.onResult).toHaveBeenCalledWith([[{ ref: 'a' }]]);
  });

  test('in local state it parses one chunk per idle slice without the worker', async () => {
    const g = governor('local');
    const send = jest.fn();
    const slices = [];
    const d = createDispatcher({ send, parseLocal: (t) => [{ ref: t }], governor: g, idle: (cb) => slices.push(cb), options: () => ({}) });
    const j = job(['a', 'b']);
    d.submit(j);
    await tick();
    expect(send).not.toHaveBeenCalled();
    slices.shift()();
    expect(j.onResult).not.toHaveBeenCalled();
    slices.shift()();
    expect(j.onResult).toHaveBeenCalledWith([[{ ref: 'a' }], [{ ref: 'b' }]]);
    expect(g.recordLocal).toHaveBeenCalledTimes(2);
  });

  test('paused drops work', async () => {
    const send = jest.fn();
    const j = job(['a']);
    createDispatcher({ send, parseLocal: jest.fn(), governor: governor('paused'), idle, options: () => ({}) }).submit(j);
    for (let i = 0; i < 3; i++) await tick();
    expect(send).not.toHaveBeenCalled();
    expect(j.onResult).not.toHaveBeenCalled();
  });
});
