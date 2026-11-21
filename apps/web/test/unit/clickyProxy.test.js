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

// Lets a background refresh (fake fetch, resolved in microtasks) finish
const settle = () => new Promise(r => setTimeout(r, 5));

describe('GET /cd7dba44d5.js', () => {
  test('fetches the tracking code with no cookie, no X-Forwarded-For and the proxy\'s own User-Agent', async () => {
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
    // One copy is shared by every visitor, so nothing of the first visitor's is sent
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('x-forwarded-for')).toBeNull();
    expect(headers.get('user-agent')).toBe('scripture.guide clicky-proxy');
  });

  test('is cached for an hour; after that the old copy is served while it is fetched again', async () => {
    let t = 1_000_000;
    const fetchImpl = fakeFetch(js('one'), js('two'));
    const app = appWith({ fetchImpl, now: () => t });
    expect((await request(app).get('/cd7dba44d5.js')).text).toBe('one');
    t += HOUR - 1;
    expect((await request(app).get('/cd7dba44d5.js')).text).toBe('one');
    expect(fetchImpl.calls).toHaveLength(1);
    t += 2;
    expect((await request(app).get('/cd7dba44d5.js')).text).toBe('one');
    await settle();
    expect(fetchImpl.calls).toHaveLength(2);
    expect((await request(app).get('/cd7dba44d5.js')).text).toBe('two');
    expect(fetchImpl.calls).toHaveLength(2);
  });

  test('serves the stale copy at once while a refresh is in flight, and starts only one refresh', async () => {
    let t = 0;
    let release;
    const slow = () => new Promise(r => { release = () => r(new Response('fresh', { headers: { 'Content-Type': 'text/javascript' } })); });
    const fetchImpl = fakeFetch(js('stale'), slow);
    const app = appWith({ fetchImpl, now: () => t });
    await request(app).get('/cd7dba44d5.js');
    t += HOUR + 1;
    const [a, b] = await Promise.all([request(app).get('/cd7dba44d5.js'), request(app).get('/cd7dba44d5.js')]);
    expect([a.text, b.text]).toEqual(['stale', 'stale']);
    expect(fetchImpl.calls).toHaveLength(2);
    release();
    await settle();
    expect((await request(app).get('/cd7dba44d5.js')).text).toBe('fresh');
  });

  test('keeps the stale copy when the refresh fails, and waits a minute before trying again', async () => {
    let t = 0;
    const fetchImpl = fakeFetch(js('cached'), new Error('down'), js('back'));
    const app = appWith({ fetchImpl, now: () => t });
    await request(app).get('/cd7dba44d5.js');
    t += HOUR + 1;
    const res = await request(app).get('/cd7dba44d5.js');
    await settle();
    expect(fetchImpl.calls).toHaveLength(2);
    expect(res.status).toBe(200);
    expect(res.text).toBe('cached');
    expect(res.headers['content-type']).toMatch(/^application\/javascript/);
    t += 30_000;
    expect((await request(app).get('/cd7dba44d5.js')).text).toBe('cached');
    await settle();
    expect(fetchImpl.calls).toHaveLength(2);
    t += 30_001;
    await request(app).get('/cd7dba44d5.js');
    await settle();
    expect(fetchImpl.calls).toHaveLength(3);
    expect((await request(app).get('/cd7dba44d5.js')).text).toBe('back');
  });

  test.each([
    ['a failed status', () => new Response('oops', { status: 502, headers: { 'Content-Type': 'text/javascript' } })],
    ['an empty body', () => new Response('', { status: 200, headers: { 'Content-Type': 'text/javascript' } })],
    ['an HTML block page', () => new Response('<!DOCTYPE html><title>Attention Required!</title>', { status: 200, headers: { 'Content-Type': 'text/html' } })],
  ])('%s is never cached', async (_name, bad) => {
    let t = 0;
    const fetchImpl = fakeFetch(js('cached'), bad);
    const app = appWith({ fetchImpl, now: () => t });
    await request(app).get('/cd7dba44d5.js');
    t += HOUR + 1;
    await request(app).get('/cd7dba44d5.js');
    await settle();
    expect(fetchImpl.calls).toHaveLength(2);
    expect((await request(app).get('/cd7dba44d5.js')).text).toBe('cached');
    // and with nothing cached it is a 204, not the bad body
    const fresh = appWith({ fetchImpl: fakeFetch(bad) });
    const res = await request(fresh).get('/cd7dba44d5.js');
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
  });

  test('answers 204 with an empty body when the fetch fails and nothing is cached', async () => {
    const fetchImpl = fakeFetch(new Error('timeout'));
    const res = await request(appWith({ fetchImpl })).get('/cd7dba44d5.js');
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
  });

  test('after a first failure with nothing cached, answers 204 at once for a minute, then tries again', async () => {
    let t = 0;
    const fetchImpl = fakeFetch(new Error('down'), js('ok'));
    const app = appWith({ fetchImpl, now: () => t });
    expect((await request(app).get('/cd7dba44d5.js')).status).toBe(204);
    t += 59_999;
    expect((await request(app).get('/cd7dba44d5.js')).status).toBe(204);
    expect(fetchImpl.calls).toHaveLength(1);
    t += 2;
    const res = await request(app).get('/cd7dba44d5.js');
    expect(fetchImpl.calls).toHaveLength(2);
    expect(res.status).toBe(200);
    expect(res.text).toBe('ok');
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

  test('does not follow redirects: relays the status and Location', async () => {
    const fetchImpl = fakeFetch(() => new Response(null, { status: 302, headers: { Location: 'https://clicky.com/elsewhere' } }));
    const res = await request(appWith({ fetchImpl })).get('/e9b1e2e71a?site_id=1');
    expect(fetchImpl.calls[0].init.redirect).toBe('manual');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://clicky.com/elsewhere');
  });

  test('a POST body over the limit answers 204 without calling Clicky', async () => {
    const fetchImpl = fakeFetch(beacon());
    const res = await request(appWith({ fetchImpl })).post('/e9b1e2e71a')
      .set('Content-Type', 'text/plain').send('x'.repeat(65 * 1024));
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(fetchImpl.calls).toHaveLength(0);
  });

  test('a POST with an unsupported Content-Encoding answers 204, through createApp too', async () => {
    const fetchImpl = fakeFetch(beacon());
    const app = createApp({ log: false, clicky: clickyProxy({ fetchImpl }) });
    const res = await request(app).post('/e9b1e2e71a').set('Host', 'scripture.guide')
      .set('Content-Type', 'text/plain').set('Content-Encoding', 'bogus').send('abc');
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(fetchImpl.calls).toHaveLength(0);
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
  const TAG = `<script async data-id="${CLICKY_SITE_ID}" src="//static.getclicky.com/js"></script>`;

  test('the site id is the public one', () => {
    expect(CLICKY_SITE_ID).toBe('100988820');
  });

  test('is in the <head> of a page in production', async () => {
    const res = await request(createApp({ log: false, analytics: true })).get('/').set('Host', 'scripture.guide');
    expect(res.status).toBe(200);
    expect(res.text).toContain(TAG);
    expect(res.text.indexOf(TAG)).toBeLessThan(res.text.indexOf('</head>'));
  });

  test('?clicky=proxy loads the script through the same-origin proxy (for testing it)', async () => {
    const res = await request(createApp({ log: false, analytics: true })).get('/?clicky=proxy').set('Host', 'scripture.guide');
    expect(res.text).toContain(`<script async data-id="${CLICKY_SITE_ID}" src="/cd7dba44d5.js"></script>`);
    expect(res.text).not.toContain('static.getclicky.com');
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
