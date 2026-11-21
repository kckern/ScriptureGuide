import { describe, test, expect } from 'vitest';
import { versionNames } from '../../src/app/createApp.js';

const run = async mw => {
  const res = { locals: {} };
  let called = false;
  await mw({}, res, () => { called = true; });
  return { names: res.locals.verNames, called };
};

describe('versionNames middleware', () => {
  test('a failed query is retried on the next request; a good one is kept', async () => {
    let calls = 0;
    const db = { query: async () => {
      calls++;
      if (calls === 1) throw new Error('down');
      return [{ id: 'NRSV', title: 'New Revised Standard Version' }];
    } };
    const mw = versionNames(db);
    expect(await run(mw)).toEqual({ names: {}, called: true });
    expect(await run(mw)).toEqual({ names: { NRSV: 'New Revised Standard Version' }, called: true });
    expect(await run(mw)).toEqual({ names: { NRSV: 'New Revised Standard Version' }, called: true });
    expect(calls).toBe(2);
  });
});

describe('versionNames middleware: one read at a time', () => {
  test('concurrent requests share one read', async () => {
    let calls = 0;
    let release;
    const db = { query: () => { calls++; return new Promise(r => { release = () => r([{ id: 'KJV', title: 'King James Version' }]); }); } };
    const mw = versionNames(db);
    const both = Promise.all([run(mw), run(mw)]);
    await new Promise(r => setImmediate(r));
    release();
    const [a, b] = await both;
    expect(a.names).toEqual({ KJV: 'King James Version' });
    expect(b.names).toEqual({ KJV: 'King James Version' });
    expect(calls).toBe(1);
  });
  test('a failed read is logged', async () => {
    const logged = [];
    const mw = versionNames({ query: async () => { throw new Error('down'); } }, (err, fields) => logged.push([err.message, fields]));
    expect((await run(mw)).names).toEqual({});
    expect(logged).toEqual([['down', { where: 'version names' }]]);
  });
});
