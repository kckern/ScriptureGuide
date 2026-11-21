import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { htmlAccess } from '../../../src/app/middleware/htmlAccess.js';
import { setLogWriter } from '../../../src/app/log.js';

const HEADERS = { 'RateLimit-Policy': '"html";q=120;w=60', RateLimit: '"html";r=0;t=60' };
function fakeAccess(result) {
  const calls = [];
  return {
    calls,
    async check(req, opts) {
      calls.push({ path: req.path, ...opts });
      if (result instanceof Error) throw result;
      return result;
    },
  };
}
function appWith(access) {
  return express()
    .use(htmlAccess(access))
    .post('/vbox', (req, res) => res.send('vbox'))
    .get('*', (req, res) => res.json({ access: req.access ?? null }));
}
const allowed = { caller: 'ip:203.0.113.9', tier: 'html', allowed: true, over: false, refused: false, retryAfter: 0, headers: HEADERS };

const lines = [];
let previousWriter;
beforeAll(() => { previousWriter = setLogWriter(line => lines.push(JSON.parse(line))); });
afterAll(() => setLogWriter(previousWriter));

describe('htmlAccess', () => {
  test('a page is checked with scope html and req.access is set; no RateLimit headers', async () => {
    const access = fakeAccess(allowed);
    const res = await request(appWith(access)).get('/john.3.16');
    expect(res.status).toBe(200);
    expect(access.calls).toEqual([{ path: '/john.3.16', scope: 'html' }]);
    expect(res.body.access).toMatchObject({ caller: 'ip:203.0.113.9', tier: 'html' });
    expect(res.headers['ratelimit-policy']).toBeUndefined();
    expect(res.headers.ratelimit).toBeUndefined();
  });

  test('HEAD is checked; other methods are not', async () => {
    const access = fakeAccess(allowed);
    await request(appWith(access)).head('/nrsv/john.3.16');
    await request(appWith(access)).post('/vbox');
    expect(access.calls.map(c => c.path)).toEqual(['/nrsv/john.3.16']);
  });

  test('service paths, link-preview cards and the AJAX endpoints are not checked', async () => {
    const access = fakeAccess(allowed);
    const app = appWith(access);
    for (const path of ['/health', '/healthz', '/build-info', '/og/x.jpg', '/og/nrsv/john.3.16.jpg',
      '/vbox?ref=john.3.16', '/VBOX', '/passage', '/passage/', '/versionselect', '/settings', '/save_prefs']) {
      expect((await request(app).get(path)).status).toBe(200);
    }
    expect(access.calls).toEqual([]);
  });

  test('pages whose names start like a skipped path are still checked', async () => {
    const access = fakeAccess(allowed);
    const app = appWith(access);
    await request(app).get('/healthy');
    await request(app).get('/passages.of.note');
    expect(access.calls.map(c => c.path)).toEqual(['/healthy', '/passages.of.note']);
  });

  test('allowed false never refuses a page', async () => {
    const access = fakeAccess({ ...allowed, allowed: false, over: true, refused: true, retryAfter: 9 });
    const res = await request(appWith(access)).get('/john.3.16');
    expect(res.status).toBe(200);
    expect(res.headers['retry-after']).toBeUndefined();
    expect(res.headers.ratelimit).toBeUndefined();
  });

  test('a check that throws is logged and the page still answers', async () => {
    const res = await request(appWith(fakeAccess(new Error('buckets broke')))).get('/john.3.16');
    expect(res.status).toBe(200);
    expect(res.body.access).toBeNull();
    expect(lines.at(-1)).toMatchObject({ msg: 'error', where: 'html access', path: '/john.3.16', error: 'buckets broke' });
  });
});
