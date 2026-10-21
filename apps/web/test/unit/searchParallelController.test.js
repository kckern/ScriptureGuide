import { describe, test, expect, vi } from 'vitest';
import { SearchParallelController } from '../../src/app/controllers/SearchParallelController.js';
import { parseRequest } from '../../src/domain/rules/requestParsing.js';

// req.config as configMiddleware builds it, from the raw (still encoded) path and query
function setup() {
  const parallel = { build: vi.fn(async q => ({ title: q, rows: [] })) };
  const search = { search: vi.fn(async q => ({ query: q.replace(/\./g, ' '), count: 0, vols: [], rows: [] })) };
  const ctl = new SearchParallelController(parallel, search);
  const res = { render: vi.fn() };
  const req = (path, { host = 'scripture.guide', query = {} } = {}) =>
    ({ config: parseRequest({ host, path, query }), headers: { host }, originalUrl: path });
  return { ctl, parallel, search, res, req };
}

describe('SearchParallelController.dispatch', () => {
  test('a tilde after the first character is a parallel view, version included', async () => {
    const { ctl, parallel, res, req } = setup();
    expect(await ctl.dispatch(req('/kjv/isa.2.1~2ne.12.1'), res)).toBe(true);
    expect(parallel.build).toHaveBeenCalledWith('kjv/isa.2.1~2ne.12.1');
    expect(res.render.mock.calls[0][0]).toBe('parallel');
  });

  test('/search/<q> searches all versions', async () => {
    const { ctl, search, res, req } = setup();
    expect(await ctl.dispatch(req('/search/faith.hope.charity'), res)).toBe(true);
    expect(search.search).toHaveBeenCalledWith('faith hope charity', { forcedVersion: null });
    expect(res.render.mock.calls[0][0]).toBe('search');
  });

  test('a reference without digits searches, limited to the path version', async () => {
    const { ctl, search, res, req } = setup();
    await ctl.dispatch(req('/kjv/faith'), res);
    expect(search.search).toHaveBeenCalledWith('faith', { forcedVersion: 'KJV' });
  });

  test('the forced version is the format of the last version piece', async () => {
    const { ctl, search, res, req } = setup();
    await ctl.dispatch(req('/kjv.1830*rebom/faith'), res);
    expect(search.search).toHaveBeenLastCalledWith('faith', { forcedVersion: 'REBOM' });
  });

  test('every segment after the version is part of the search, joined with "; "', async () => {
    const { ctl, search, res, req } = setup();
    await ctl.dispatch(req('/kjv/faith/hope'), res);
    expect(search.search).toHaveBeenLastCalledWith('faith; hope', { forcedVersion: 'KJV' });
    await ctl.dispatch(req('/latest/meta-data/iam'), res);
    expect(search.search).toHaveBeenLastCalledWith('meta-data; iam', { forcedVersion: 'LATEST' });
    await ctl.dispatch(req('/site/word/'), res);
    expect(search.search).toHaveBeenLastCalledWith('word; ', { forcedVersion: 'SITE' });
  });

  test('paths whose first segment is not a version name still split at the first /', async () => {
    const { ctl, search, res, req } = setup();
    await ctl.dispatch(req('/_cluster/settings'), res);
    expect(search.search).toHaveBeenLastCalledWith('settings', { forcedVersion: '_CLUSTER' });
    await ctl.dispatch(req('/%3Chead%3E/_search'), res);
    expect(search.search).toHaveBeenLastCalledWith('_search', { forcedVersion: '<HEAD>' });
  });

  test('an ampersand fragment is a request key, not part of the search', async () => {
    const { ctl, search, res, req } = setup();
    await ctl.dispatch(req('/lds/d&'), res);
    expect(search.search).toHaveBeenLastCalledWith('d', { forcedVersion: 'LDS' });
  });

  test('a digit after the version is a lookup, even with extra segments', async () => {
    const { ctl, res, req } = setup();
    expect(await ctl.dispatch(req('/prometheus/api/v1/query'), res)).toBe(false);
  });

  test('an empty reference renders home, before search', async () => {
    const { ctl, search, res, req } = setup();
    for (const path of ['/~/', '/__debug__/', '//feed/', '/x/', '/0', '/kjv/0', '/john.3.16']) {
      res.render.mockClear();
      const query = path === '/john.3.16' ? { q: '' } : {};
      expect(await ctl.dispatch(req(path, { query }), res)).toBe(true);
      expect(res.render.mock.calls[0][0]).toBe('home');
    }
    expect(search.search).not.toHaveBeenCalled();
  });

  test('home is titled "Home", or "0" for the reference "0" (a lookup titled $ref on live)', async () => {
    const { ctl, res, req } = setup();
    const title = async path => { res.render.mockClear(); await ctl.dispatch(req(path), res); return res.render.mock.calls[0][1].title; };
    expect(await title('/0')).toBe('0');
    expect(await title('/kjv/0')).toBe('0');
    expect(await title('/~/')).toBe('Home');
    expect(await title('/x/')).toBe('Home');
  });

  test('?q= replaces the path', async () => {
    const { ctl, search, res, req } = setup();
    expect(await ctl.dispatch(req('/search', { query: { q: 'call 12345' } }), res)).toBe(false);
    expect(search.search).not.toHaveBeenCalled();
  });

  test('ordinary references and non-HTML formats pass through', async () => {
    const { ctl, res, req } = setup();
    expect(await ctl.dispatch(req('/john.3.16'), res)).toBe(false);
    expect(await ctl.dispatch(req('/a~b', { host: 'api.scripture.guide' }), res)).toBe(false);
    expect(await ctl.dispatch(req('/', { host: 'api.scripture.guide' }), res)).toBe(false);
    expect(await ctl.dispatch(req('/~john.3'), res)).toBe(false);
    expect(res.render).not.toHaveBeenCalled();
  });
});
