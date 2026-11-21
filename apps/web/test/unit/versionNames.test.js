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
