import { describe, test, expect, vi } from 'vitest';
import { SearchParallelController } from '../../src/app/controllers/SearchParallelController.js';

function setup() {
  const parallel = { build: vi.fn(async q => ({ title: q, rows: [] })) };
  const search = { search: vi.fn(async q => ({ query: q.replace(/\./g, ' '), count: 0, vols: [], rows: [] })) };
  const ctl = new SearchParallelController(parallel, search);
  const res = { render: vi.fn() };
  const req = (params, outputFormat = 'html') => ({ params, config: { outputFormat }, headers: { host: 'scripture.guide' }, originalUrl: '/x' });
  return { ctl, parallel, search, res, req };
}

describe('SearchParallelController.dispatch', () => {
  test('a tilde after the first character is a parallel view, version included', async () => {
    const { ctl, parallel, res, req } = setup();
    expect(await ctl.dispatch(req({ version: 'kjv', reference: 'isa.2.1~2ne.12.1' }), res)).toBe(true);
    expect(parallel.build).toHaveBeenCalledWith('kjv/isa.2.1~2ne.12.1');
    expect(res.render.mock.calls[0][0]).toBe('parallel');
  });

  test('/search/<q> searches all versions', async () => {
    const { ctl, search, res, req } = setup();
    expect(await ctl.dispatch(req({ version: 'search', reference: 'faith.hope.charity' }), res)).toBe(true);
    expect(search.search).toHaveBeenCalledWith('faith.hope.charity', { forcedVersion: null });
    expect(res.render.mock.calls[0][0]).toBe('search');
  });

  test('a reference without digits searches, limited to the path version', async () => {
    const { ctl, search, res, req } = setup();
    await ctl.dispatch(req({ version: 'kjv', reference: 'faith' }), res);
    expect(search.search).toHaveBeenCalledWith('faith', { forcedVersion: 'KJV' });
  });

  test('ordinary references and non-HTML formats pass through', async () => {
    const { ctl, res, req } = setup();
    expect(await ctl.dispatch(req({ reference: 'john.3.16' }), res)).toBe(false);
    expect(await ctl.dispatch(req({ reference: 'a~b' }, 'api'), res)).toBe(false);
    expect(await ctl.dispatch(req({ reference: '~john.3' }), res)).toBe(false);
    expect(res.render).not.toHaveBeenCalled();
  });
});
