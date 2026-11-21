import { describe, test, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

// The v1 router through the real app (createApp): middleware order, host parsing, headers.
// The database knows one version (NRSV) and one verse (John 3:16). fail makes every query
// reject, as when the database is down.
const db = vi.hoisted(() => ({ fail: false }));
vi.mock('../../../src/data/db/connection.js', () => ({
  default: {
    query: async (sql, params = []) => {
      if (db.fail) throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3306'), { code: 'ECONNREFUSED', errno: -61 });
      if (/FROM scripture_versions/.test(sql)) {
        return [{ id: 'NRSV', title: 'NRSV', title_long: 'New Revised Standard Version', lang: 'en' }];
      }
      if (/FROM scripture_verses WHERE version = \?/.test(sql) && params[0] === 'NRSV') {
        return [{ verse_id: 26137, text: 'For God so loved the world.' }];
      }
      if (/FROM lds_scriptures_verses v JOIN lds_scriptures_books/.test(sql)) {
        return [{ verse_id: 26137, book_id: 43, chapter: 3, verse: 16, book_title: 'John', book_title_short: 'John' }];
      }
      return [];
    },
    execute: async () => [[]],
  },
}));

const { createApp } = await import('../../../src/app/createApp.js');
const { setLogWriter } = await import('../../../src/app/log.js');
const app = createApp({ log: false });
const get = (host, path) => request(app).get(path).set('Host', host);

const lines = [];
let previousWriter;
beforeAll(() => { previousWriter = setLogWriter(line => lines.push(JSON.parse(line))); });
afterAll(() => setLogWriter(previousWriter));

const CACHE_OK = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400';

describe('v1 through createApp', () => {
  test('a passage: v1 body and headers', async () => {
    const res = await get('api.scripture.guide', '/v1/nrsv/john3.16');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      api: 'v1',
      versions: [{ id: 'NRSV', name: 'New Revised Standard Version', language: 'en', copyright: null }],
      passages: [{ verses: [{ id: 26137, chapter: 3, verse: 16, texts: { NRSV: 'For God so loved the world.' } }] }],
    });
    expect(res.headers['x-api-version']).toBe('1');
    expect(res.headers['cache-control']).toBe(CACHE_OK);
    expect(res.headers.etag).toMatch(/^"[^"]+"$/);
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  test('a weak If-None-Match (Cloudflare re-encoded) still gets 304 through compression', async () => {
    const first = await get('api.scripture.guide', '/v1/nrsv/john3.16').set('Accept-Encoding', 'gzip');
    const again = await get('api.scripture.guide', '/v1/nrsv/john3.16').set('Accept-Encoding', 'gzip').set('If-None-Match', `W/${first.headers.etag}`);
    expect(again.status).toBe(304);
  });

  test('an upper-case host with a port', async () => {
    const res = await get('API.Scripture.Guide:8443', '/v1/nrsv/john3.16');
    expect(res.status).toBe(200);
    expect(res.body.api).toBe('v1');
  });

  test('X-Forwarded-Host is ignored: the Host header picks the host', async () => {
    const site = await get('scripture.guide', '/v1/nrsv/john3.16').set('X-Forwarded-Host', 'api.scripture.guide');
    expect(site.headers['x-api-version']).toBeUndefined();
    const api = await get('api.scripture.guide', '/v1/nrsv/john3.16').set('X-Forwarded-Host', 'scripture.guide');
    expect(api.headers['x-api-version']).toBe('1');
    expect(api.body.api).toBe('v1');
  });

  test('the main-host shortcut scripture.guide/api/v1/...', async () => {
    const res = await get('scripture.guide', '/api/v1/nrsv/john3.16');
    expect(res.status).toBe(200);
    expect(res.body.passages[0].verses[0].texts.NRSV).toBe('For God so loved the world.');
  });

  test('json. /health reaches the site route', async () => {
    const res = await get('json.scripture.guide', '/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.headers['x-api-version']).toBeUndefined();
  });

  test('a failing database is a v1 503, logged, never cached', async () => {
    db.fail = true;
    try {
      const res = await get('api.scripture.guide', '/v1/nrsv/john3.16');
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ api: 'v1', error: { code: 'service_unavailable', message: 'The scripture database is not answering. Try again shortly.' } });
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['retry-after']).toBe('30');
      expect(res.headers['x-api-version']).toBe('1');
      expect(lines.some(l => l.msg === 'error' && l.where === 'api' && l.path === '/v1/nrsv/john3.16')).toBe(true);
    } finally {
      db.fail = false;
    }
  });
});

describe('access through createApp', () => {
  test('an api request carries RateLimit headers; observe mode never refuses a burst', async () => {
    let last;
    for (let i = 0; i < 70; i++) last = await get('api.scripture.guide', '/v1/versions');
    expect(last.status).toBe(200);
    expect(last.headers['ratelimit-policy']).toBe('"anonymous";q=60;w=60');
    expect(last.headers.ratelimit).toMatch(/^"anonymous";r=0;t=\d+$/);
    expect(lines.some(l => l.msg === 'rate_limit' && l.scope === 'api' && l.refused === false)).toBe(true);
  });
});

describe('one access check shared by the API and the website', () => {
  test('createApp passes its access to both, with the API and html scopes', async () => {
    const calls = [];
    const access = {
      mode: 'observe',
      check: async (req, { scope }) => {
        calls.push({ scope, path: req.path });
        return { caller: 'ip:203.0.113.9', tier: scope === 'html' ? 'html' : 'anonymous', allowed: true, over: false, refused: false, retryAfter: 0, headers: {} };
      },
    };
    const shared = createApp({ log: false, access });
    await request(shared).get('/v1/versions').set('Host', 'api.scripture.guide');
    await request(shared).get('/nrsv/john.3.16').set('Host', 'scripture.guide');
    await request(shared).get('/healthz').set('Host', 'scripture.guide');
    expect(calls).toEqual([{ scope: 'api', path: '/v1/versions' }, { scope: 'html', path: '/nrsv/john.3.16' }]);
  });
});
