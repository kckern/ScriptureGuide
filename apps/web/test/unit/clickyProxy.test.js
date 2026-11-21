import { describe, test, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import ejs from 'ejs';
import { fileURLToPath } from 'node:url';
import { clickyProxy, CLICKY_SITE_ID } from '../../src/app/middleware/clickyProxy.js';

vi.mock('../../src/data/db/connection.js', () => ({ default: { query: async () => [] } }));
const { createApp } = await import('../../src/app/createApp.js');

const JS_URL = 'https://static.getclicky.com/js?in=%2Fe9b1e2e71a';
const IN_URL = 'https://in.getclicky.com/in.php';
const HOUR = 60 * 60 * 1000;

// A fetch stand-in: records each call and answers with the next queued response (or throws).
function fakeFetch(...answers) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init, headers: new Headers(init.headers) });
    const next = answers.length > 1 ? answers.shift() : answers[0];
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next() : next;
  };
  fn.calls = calls;
  return fn;
}

const js = (body = 'var clicky={};', type = 'text/javascript') =>
  () => new Response(body, { status: 200, headers: { 'Content-Type': type } });

const appWith = opts => express().use(clickyProxy(opts));

describe('GET /cd7dba44d5.js', () => {
  test('fetches the tracking code with no cookie, the visitor appended to X-Forwarded-For and their User-Agent', async () => {
    const fetchImpl = fakeFetch(js());
    const res = await request(appWith({ fetchImpl })).get('/cd7dba44d5.js')
      .set('X-Forwarded-For', '203.0.113.7').set('User-Agent', 'Visitor/1.0').set('Cookie', 'a=b; _cky_ignore=x');
    expect(res.status).toBe(200);
    expect(res.text).toBe('var clicky={};');
    expect(res.headers['content-type']).toMatch(/^application\/javascript/);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    expect(fetchImpl.calls).toHaveLength(1);
    const { url, init, headers } = fetchImpl.calls[0];
    expect(url).toBe(JS_URL);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.7, 127.0.0.1');
    expect(headers.get('user-agent')).toBe('Visitor/1.0');
  });

  test('X-Forwarded-For is the visitor alone when none came in', async () => {
    const fetchImpl = fakeFetch(js());
    await request(appWith({ fetchImpl })).get('/cd7dba44d5.js');
    expect(fetchImpl.calls[0].headers.get('x-forwarded-for')).toBe('127.0.0.1');
  });

  test('is cached for an hour, then fetched again', async () => {
    let t = 1_000_000;
    const fetchImpl = fakeFetch(js('one'), js('two'));
    const app = appWith({ fetchImpl, now: () => t });
    expect((await request(app).get('/cd7dba44d5.js')).text).toBe('one');
    t += HOUR - 1;
    expect((await request(app).get('/cd7dba44d5.js')).text).toBe('one');
    expect(fetchImpl.calls).toHaveLength(1);
    t += 2;
    expect((await request(app).get('/cd7dba44d5.js')).text).toBe('two');
    expect(fetchImpl.calls).toHaveLength(2);
  });

  test('serves the stale copy when the refetch fails', async () => {
    let t = 0;
    const fetchImpl = fakeFetch(js('cached'), new Error('down'));
    const app = appWith({ fetchImpl, now: () => t });
    await request(app).get('/cd7dba44d5.js');
    t += HOUR + 1;
    const res = await request(app).get('/cd7dba44d5.js');
    expect(fetchImpl.calls).toHaveLength(2);
    expect(res.status).toBe(200);
    expect(res.text).toBe('cached');
    expect(res.headers['content-type']).toMatch(/^application\/javascript/);
  });

  test('a failed upstream status counts as a failure too', async () => {
    let t = 0;
    const fetchImpl = fakeFetch(js('cached'), () => new Response('oops', { status: 502 }));
    const app = appWith({ fetchImpl, now: () => t });
    await request(app).get('/cd7dba44d5.js');
    t += HOUR + 1;
    expect((await request(app).get('/cd7dba44d5.js')).text).toBe('cached');
  });

  test('answers 204 with an empty body when the fetch fails and nothing is cached', async () => {
    const fetchImpl = fakeFetch(new Error('timeout'));
    const res = await request(appWith({ fetchImpl })).get('/cd7dba44d5.js');
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
  });
});

describe('/e9b1e2e71a (the beacon)', () => {
  const beacon = (body = 'clicky_ok();', status = 200, cookies = []) => () => {
    const headers = new Headers({ 'Content-Type': 'application/javascript' });
    for (const c of cookies) headers.append('Set-Cookie', c);
    return new Response(body, { status, headers });
  };

  test('GET forwards the query string and the headers nginx sets', async () => {
    const fetchImpl = fakeFetch(beacon());
    await request(appWith({ fetchImpl })).get('/e9b1e2e71a?site_id=100988820&res=1920x1080&href=%2Fjohn.3.16')
      .set('Host', 'scripture.guide').set('X-Forwarded-Proto', 'https').set('X-Forwarded-For', '198.51.100.2')
      .set('User-Agent', 'Visitor/1.0').set('Referer', 'https://scripture.guide/john.3.16');
    const { url, init, headers } = fetchImpl.calls[0];
    expect(url).toBe(`${IN_URL}?site_id=100988820&res=1920x1080&href=%2Fjohn.3.16`);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(headers.get('x-forwarded-proto')).toBe('https');
    expect(headers.get('x-forwarded-host')).toBe('scripture.guide');
    expect(headers.get('x-forwarded-for')).toBe('198.51.100.2, 127.0.0.1');
    expect(headers.get('user-agent')).toBe('Visitor/1.0');
    expect(headers.get('referer')).toBe('https://scripture.guide/john.3.16');
    expect(headers.get('cookie')).toBeNull();
  });

  test('no query string forwards the bare in.php URL', async () => {
    const fetchImpl = fakeFetch(beacon());
    await request(appWith({ fetchImpl })).get('/e9b1e2e71a');
    expect(fetchImpl.calls[0].url).toBe(IN_URL);
  });

  test('X-Forwarded-Proto is http for a plain request outside production, https in production', async () => {
    const dev = fakeFetch(beacon());
    await request(appWith({ fetchImpl: dev, production: false })).get('/e9b1e2e71a');
    expect(dev.calls[0].headers.get('x-forwarded-proto')).toBe('http');
    const prod = fakeFetch(beacon());
    await request(appWith({ fetchImpl: prod, production: true })).get('/e9b1e2e71a');
    expect(prod.calls[0].headers.get('x-forwarded-proto')).toBe('https');
  });

  test('POST forwards the raw body and its content type', async () => {
    const fetchImpl = fakeFetch(beacon());
    await request(appWith({ fetchImpl })).post('/e9b1e2e71a?site_id=100988820')
      .set('Content-Type', 'application/x-www-form-urlencoded').send('a=1&b=two%20words');
    const { url, init, headers } = fetchImpl.calls[0];
    expect(url).toBe(`${IN_URL}?site_id=100988820`);
    expect(init.method).toBe('POST');
    expect(Buffer.from(init.body).toString()).toBe('a=1&b=two%20words');
    expect(headers.get('content-type')).toBe('application/x-www-form-urlencoded');
  });

  test('POST through createApp gets the unparsed body (mounted before the body parsers)', async () => {
    const fetchImpl = fakeFetch(beacon());
    const app = createApp({ log: false, clicky: clickyProxy({ fetchImpl }) });
    await request(app).post('/e9b1e2e71a').set('Host', 'scripture.guide')
      .set('Content-Type', 'application/json').send('{"x":1}');
    expect(Buffer.from(fetchImpl.calls[0].init.body).toString()).toBe('{"x":1}');
  });

  test('sends only the _cky_ignore and _cky_osa cookies, and only when _cky_ignore is set', async () => {
    const withIgnore = fakeFetch(beacon());
    await request(appWith({ fetchImpl: withIgnore })).get('/e9b1e2e71a')
      .set('Cookie', 'prefs=1; _cky_osa=osa1; other=z; _cky_ignore=ign1');
    expect(withIgnore.calls[0].headers.get('cookie')).toBe('_cky_ignore=ign1; _cky_osa=osa1');

    const without = fakeFetch(beacon());
    await request(appWith({ fetchImpl: without })).get('/e9b1e2e71a').set('Cookie', 'prefs=1; _cky_osa=osa1');
    expect(without.calls[0].headers.get('cookie')).toBeNull();
  });

  test('relays the status, content type, every Set-Cookie and the body, with no-store', async () => {
    const fetchImpl = fakeFetch(beacon('/* ok */', 202, ['_cky_ignore=abc; Path=/', '_cky_osa=def; Path=/', 'third=3']));
    const res = await request(appWith({ fetchImpl })).get('/e9b1e2e71a?site_id=100988820');
    expect(res.status).toBe(202);
    expect(res.headers['content-type']).toMatch(/^application\/javascript/);
    expect(res.headers['set-cookie']).toEqual(['_cky_ignore=abc; Path=/', '_cky_osa=def; Path=/', 'third=3']);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.text).toBe('/* ok */');
  });

  test('answers 204 when the upstream fails or times out', async () => {
    const err = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    for (const method of ['get', 'post']) {
      const res = await request(appWith({ fetchImpl: fakeFetch(err) }))[method]('/e9b1e2e71a?site_id=1');
      expect(res.status).toBe(204);
      expect(res.text).toBe('');
    }
  });
});

describe('through createApp', () => {
  test('both paths are answered by the proxy, ahead of the site routes', async () => {
    const fetchImpl = fakeFetch(js('var tracker;'), () => new Response('beacon', { headers: { 'Content-Type': 'text/javascript' } }));
    const app = createApp({ log: false, clicky: clickyProxy({ fetchImpl }) });
    const script = await request(app).get('/cd7dba44d5.js').set('Host', 'scripture.guide');
    expect(script.status).toBe(200);
    expect(script.text).toBe('var tracker;');
    const hit = await request(app).get('/e9b1e2e71a?site_id=100988820').set('Host', 'www.scripture.guide');
    expect(hit.status).toBe(200);
    expect(hit.text).toBe('beacon');
    expect(fetchImpl.calls.map(c => c.url)).toEqual([JS_URL, `${IN_URL}?site_id=100988820`]);
  });
});

describe('the page tag', () => {
  const TAG = `<script async data-id="${CLICKY_SITE_ID}" src="/cd7dba44d5.js"></script>`;

  test('the site id is the public one', () => {
    expect(CLICKY_SITE_ID).toBe('100988820');
  });

  test('is in the <head> of a page in production', async () => {
    const res = await request(createApp({ log: false, analytics: true })).get('/').set('Host', 'scripture.guide');
    expect(res.status).toBe(200);
    expect(res.text).toContain(TAG);
    expect(res.text.indexOf(TAG)).toBeLessThan(res.text.indexOf('</head>'));
  });

  test('is absent outside production', async () => {
    const res = await request(createApp({ log: false, analytics: false })).get('/').set('Host', 'scripture.guide');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('cd7dba44d5');
  });

  test('every view renders it from the clickyId local', async () => {
    for (const view of ['home', 'error']) {
      const file = fileURLToPath(new URL(`../../src/presentation/views/${view}.ejs`, import.meta.url));
      expect(await ejs.renderFile(file, { config: {}, clickyId: CLICKY_SITE_ID, message: 'x', status: 404 })).toContain(TAG);
      expect(await ejs.renderFile(file, { config: {}, message: 'x', status: 404 })).not.toContain('cd7dba44d5');
    }
  });
});
