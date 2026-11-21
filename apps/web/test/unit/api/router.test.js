import { describe, test, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { apiRouter, hostKind } from '../../../src/api/v1/router.js';
import { ApiError } from '../../../src/api/v1/errors.js';

const passage = {
  api: 'v1', query: 'john3.16',
  versions: [{ id: 'NRSV', name: 'NRSV', language: 'en', copyright: null }],
  reference: [{ label: 'John 3:16' }],
  passages: [{ headings: { NRSV: null }, verses: [{ id: 26137, chapter: 3, verse: 16, texts: { NRSV: 'For God so loved the world.' } }] }],
  parallels: [], links: {},
};
const seen = [];
const deps = {
  repo: { versions: async () => new Map([['nrsv', { id: 'NRSV', name: 'NRSV', lang: 'en' }]]) },
  buildPassage: async req => {
    seen.push(req);
    if (req.reference === 'jon3.16') throw new ApiError('verse_out_of_range', 'Jonah 3 has 10 verses.', 'Jonah 3:10');
    if (req.reference === 'boom') throw new Error('database down');
    return passage;
  },
  buildParallel: async () => ({ api: 'v1', rows: [] }),
  buildSearch: async () => ({ api: 'v1', results: [] }),
  pickRandomVerse: async () => 26137,
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
  test('other failures go to the error handler', async () => {
    const res = await get('api.scripture.guide', '/v1/boom');
    expect(res.status).toBe(500);
    expect(res.text).toBe('handled: database down');
  });
  test('only GET and HEAD', async () => {
    expect((await request(app).post('/v1/nrsv/john3.16').set('Host', 'api.scripture.guide')).status).toBe(418);
    expect((await request(app).head('/v1/nrsv/john3.16').set('Host', 'api.scripture.guide')).status).toBe(200);
  });
});
