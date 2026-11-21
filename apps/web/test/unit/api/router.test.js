import { describe, test, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { apiRouter, hostKind } from '../../../src/api/v1/router.js';
import { ApiError, isDatabaseError } from '../../../src/api/v1/errors.js';

const passage = {
  api: 'v1', query: 'john3.16',
  versions: [{ id: 'NRSV', name: 'NRSV', language: 'en', copyright: null }],
  reference: [{ label: 'John 3:16' }],
  passages: [{ headings: { NRSV: null }, verses: [{ id: 26137, chapter: 3, verse: 16, texts: { NRSV: 'For God so loved the world.' } }] }],
  parallels: [], links: {},
};
const seen = [];
const logged = [];
const deps = {
  repo: { versions: async () => new Map([['nrsv', { id: 'NRSV', name: 'NRSV', lang: 'en' }]]) },
  buildPassage: async req => {
    seen.push(req);
    if (req.reference === 'jon3.16') throw new ApiError('verse_out_of_range', 'Jonah 3 has 10 verses.', 'Jonah 3:10');
    if (req.reference === 'boom') throw Object.assign(new Error('database down'), { code: 'PROTOCOL_CONNECTION_LOST', fatal: true });
    if (req.reference === 'bug') throw new TypeError('x is undefined');
    return passage;
  },
  buildParallel: async () => ({ api: 'v1', rows: [] }),
  buildSearch: async () => ({ api: 'v1', results: [] }),
  pickRandomVerse: async () => 26137,
  logError: (err, fields) => logged.push({ err, fields }),
  buildVersions: async () => ({ api: 'v1', versions: [{ id: 'NRSV', name: 'NRSV', language: 'en', copyright: null }] }),
};
const app = express()
  .use((req, res, next) => { req.subdomain = req.headers.host.split('.')[0]; next(); })
  .use(apiRouter(deps))
  .use((req, res) => res.status(418).send('fell through'))
  .use((err, req, res, next) => res.status(500).send(`handled: ${err.message}`));
const get = (host, path) => request(app).get(path).set('Host', host);

describe('hostKind', () => {
  test('hosts and main-host shortcuts', () => {
    expect(hostKind('api', '/v1/john3.16')).toEqual({ kind: 'api', path: '/v1/john3.16' });
    expect(hostKind('txt', '/john3.16')).toEqual({ kind: 'text', path: '/john3.16' });
    expect(hostKind('plain', '/john3.16').kind).toBe('text');
    expect(hostKind('yml', '/x').kind).toBe('yaml');
    expect(hostKind('www', '/api/john3.16')).toEqual({ kind: 'api', path: '/john3.16' });
    expect(hostKind('www', '/john3.16')).toBeNull();
  });
  test('the shortcuts without a trailing slash are the root', () => {
    expect(hostKind('www', '/api')).toEqual({ kind: 'api', path: '/' });
    expect(hostKind('www', '/JSON')).toEqual({ kind: 'json', path: '/' });
    expect(hostKind('www', '/apis/john3.16')).toBeNull();
  });
});

describe('apiRouter', () => {
  test('api passage: JSON, headers', async () => {
    const res = await get('api.scripture.guide', '/v1/nrsv/john3.16');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['x-api-version']).toBe('1');
    expect(res.headers['cache-control']).toBe('public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
    expect(res.headers.etag).toMatch(/^"/);
    expect(res.body.api).toBe('v1');
  });
  test('a matching If-None-Match gets 304', async () => {
    const first = await get('api.scripture.guide', '/v1/nrsv/john3.16');
    const again = await request(app).get('/v1/nrsv/john3.16').set('Host', 'api.scripture.guide').set('If-None-Match', first.headers.etag);
    expect(again.status).toBe(304);
  });
  test('errors: status, body, short cache', async () => {
    const res = await get('api.scripture.guide', '/v1/jon3.16');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ api: 'v1', error: { code: 'verse_out_of_range', message: 'Jonah 3 has 10 verses.', suggestion: 'Jonah 3:10' } });
    expect(res.headers['cache-control']).toBe('public, max-age=300');
  });
  test('unknown version', async () => {
    expect((await get('api.scripture.guide', '/v1/foo/john3.16')).body.error.code).toBe('unknown_version');
  });
  test('the version list', async () => {
    const res = await get('api.scripture.guide', '/v1/versions');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
    expect(res.body).toEqual({ api: 'v1', versions: [{ id: 'NRSV', name: 'NRSV', language: 'en', copyright: null }] });
  });
  test('random is never cached', async () => {
    expect((await get('api.scripture.guide', '/v1/random')).headers['cache-control']).toBe('no-store');
  });
  test('simple hosts', async () => {
    expect((await get('txt.scripture.guide', '/nrsv/john3.16')).text).toBe('For God so loved the world.\n');
    expect((await get('json.scripture.guide', '/nrsv/john3.16')).body.version).toBe('NRSV');
    expect((await get('md.scripture.guide', '/nrsv/john3.16')).headers['content-type']).toMatch(/text\/markdown/);
  });
  test('simple hosts refuse search, parallel and the version list', async () => {
    expect((await get('json.scripture.guide', '/search/love')).body.error.code).toBe('search_not_supported');
    expect((await get('json.scripture.guide', '/versions')).body.error.code).toBe('versions_not_supported');
    expect((await get('json.scripture.guide', '/kjv/isa2~lds/2ne12')).body.error.code).toBe('parallel_not_supported');
  });
  test('other hosts and service paths fall through', async () => {
    expect((await get('scripture.guide', '/john3.16')).status).toBe(418);
    expect((await get('api.scripture.guide', '/health')).status).toBe(418);
  });
  test('simple hosts get no options; api passes them on', async () => {
    await get('json.scripture.guide', '/html/nrsv/john3.16');
    expect(seen.at(-1)).toMatchObject({ reference: 'john3.16', versions: ['NRSV'], options: [] });
    await get('api.scripture.guide', '/v1/html/nrsv/john3.16');
    expect(seen.at(-1)).toMatchObject({ reference: 'john3.16', versions: ['NRSV'], options: ['html'] });
  });
  test('random reads the picked verse id', async () => {
    const res = await get('api.scripture.guide', '/v1/random/bom');
    expect(res.status).toBe(200);
    expect(seen.at(-1)).toMatchObject({ reference: '26137', versions: [] });
  });
  test('simple host errors are in the host format', async () => {
    const txt = await get('txt.scripture.guide', '/jon3.16');
    expect(txt.status).toBe(404);
    expect(txt.text).toBe('Jonah 3 has 10 verses.\n');
    expect(txt.headers['cache-control']).toBe('public, max-age=300');
    expect(txt.headers['x-api-version']).toBe('1');
    const json = await get('json.scripture.guide', '/jon3.16');
    expect(json.body).toEqual({ error: { code: 'verse_out_of_range', message: 'Jonah 3 has 10 verses.', suggestion: 'Jonah 3:10' } });
  });
  test('main-host shortcuts /api/ and /json/', async () => {
    const api = await get('scripture.guide', '/api/v1/nrsv/john3.16');
    expect(api.status).toBe(200);
    expect(api.body.api).toBe('v1');
    const json = await get('scripture.guide', '/json/nrsv/john3.16');
    expect(json.body.version).toBe('NRSV');
  });
  test('a bug is logged and answered as a v1 500, never cached, with no Retry-After', async () => {
    const res = await get('api.scripture.guide', '/v1/bug');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ api: 'v1', error: { code: 'internal_error', message: 'Something went wrong on our side. It has been logged.' } });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['retry-after']).toBeUndefined();
    expect(logged.at(-1)).toMatchObject({ err: { message: 'x is undefined' }, fields: { where: 'api', path: '/v1/bug' } });
  });
  test('database and driver errors are logged and answered as a v1 503, never cached', async () => {
    const res = await get('api.scripture.guide', '/v1/boom');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ api: 'v1', error: { code: 'service_unavailable', message: 'The scripture database is not answering. Try again shortly.' } });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['retry-after']).toBe('30');
    expect(res.headers['x-api-version']).toBe('1');
    expect(logged.at(-1)).toMatchObject({ err: { message: 'database down' }, fields: { where: 'api', path: '/v1/boom' } });
    const txt = await get('txt.scripture.guide', '/boom');
    expect(txt.status).toBe(503);
    expect(txt.text).toBe('The scripture database is not answering. Try again shortly.\n');
  });
  test('what counts as a database error', () => {
    expect(isDatabaseError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).toBe(true);
    expect(isDatabaseError(Object.assign(new Error('x'), { code: 'ER_NO_SUCH_TABLE', errno: 1146, sqlState: '42S02' }))).toBe(true);
    expect(isDatabaseError(Object.assign(new Error('x'), { code: 'PROTOCOL_CONNECTION_LOST' }))).toBe(true);
    expect(isDatabaseError(Object.assign(new Error('x'), { code: 'ETIMEDOUT' }))).toBe(true);
    expect(isDatabaseError(new TypeError('x'))).toBe(false);
    expect(isDatabaseError(Object.assign(new Error('x'), { code: 'ERR_INVALID_ARG_TYPE' }))).toBe(false);
    expect(isDatabaseError(Object.assign(new Error('x'), { code: 'ENOENT', errno: -2 }))).toBe(false);
  });
  test('an error code with no status is a 500', () => {
    expect(new ApiError('no_such_code', 'x').status).toBe(500);
  });
  test('only GET and HEAD', async () => {
    expect((await request(app).post('/v1/nrsv/john3.16').set('Host', 'api.scripture.guide')).status).toBe(418);
    expect((await request(app).head('/v1/nrsv/john3.16').set('Host', 'api.scripture.guide')).status).toBe(200);
  });
  test('the api root is an index', async () => {
    const index = { api: 'v1', docs: 'https://scripture.guide/SKILL.md', versions: 'https://api.scripture.guide/v1/versions', example: 'https://api.scripture.guide/v1/john3.16' };
    for (const [host, path] of [['api.scripture.guide', '/'], ['api.scripture.guide', '/v1'], ['api.scripture.guide', '/v1/'], ['scripture.guide', '/api']]) {
      const res = await get(host, path);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(index);
      expect(res.headers['cache-control']).toBe('public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
    }
  });
  test('a simple host root is a usage hint in its format', async () => {
    const txt = await get('txt.scripture.guide', '/');
    expect(txt.status).toBe(200);
    expect(txt.text).toBe('Usage: https://txt.scripture.guide/<version>/<reference>, e.g. https://txt.scripture.guide/nrsv/john3.16\n');
    expect((await get('plain.scripture.guide', '/')).text).toMatch(/^Usage: https:\/\/plain\.scripture\.guide\//);
    expect((await get('json.scripture.guide', '/')).body).toEqual({ usage: 'https://json.scripture.guide/<version>/<reference>', example: 'https://json.scripture.guide/nrsv/john3.16' });
    expect((await get('scripture.guide', '/json')).body.usage).toBe('https://json.scripture.guide/<version>/<reference>');
    expect((await get('yml.scripture.guide', '/')).text).toBe('usage: https://yml.scripture.guide/<version>/<reference>\nexample: https://yml.scripture.guide/nrsv/john3.16\n');
    const md = await get('md.scripture.guide', '/');
    expect(md.headers['content-type']).toMatch(/text\/markdown/);
    expect(md.text).toBe('Usage: `https://md.scripture.guide/<version>/<reference>`, e.g. <https://md.scripture.guide/nrsv/john3.16>\n');
  });
});
