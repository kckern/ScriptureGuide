import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { legacyRouter } from '../../src/app/routes/legacy.js';

const appWith = deps => express().use(legacyRouter(deps));
const app = appWith({ checkDb: async () => {}, checkSphinx: async () => null });

describe('legacy .php URLs', () => {
  it.each([
    ['/versebox.php?verse_id=26137&ver=LDS&seq=1', '/vbox?verse_id=26137&ver=LDS&seq=1'],
    ['/passage_script.php?ref=John+3%3A16&version=KJV', '/passage?ref=John+3%3A16&version=KJV'],
    ['/version_select.php?ref=John+3%3A16&ver=LDS', '/versionselect?ref=John+3%3A16&ver=LDS'],
    ['/settings.php', '/settings'],
    ['/save.php', '/save_prefs'],
    ['/index.php?q=john.3.16', '/john.3.16'],
    ['/index.php?q=kjv/d%26c.4&heads', '/kjv/d&c.4?heads='],
    ['/index.php', '/'],
    ['/home.php', '/'],
    ['/search.php?q=faith.hope', '/search/faith.hope'],
    ['/parallel.php?q=isa.2~2ne.12', '/isa.2~2ne.12'],
    ['/notes.php?q=31103-4', '/notes/31103-4'],
    ['/fax.php?q=1ne.1', '/1ne.1'],
  ])('%s → 301 %s', async (from, to) => {
    const res = await request(app).get(from);
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe(to);
  });

  it('keeps the body of a POST with 308', async () => {
    const res = await request(app).post('/version_select.php').type('form').send({ ref: 'John 3:16' });
    expect(res.status).toBe(308);
    expect(res.headers.location).toBe('/versionselect');
  });

  it('never redirects off site', async () => {
    const res = await request(app).get('/index.php?q=//evil.example/x');
    expect(res.headers.location).toBe('/evil.example/x');
  });

  it.each(['/hub.php', '/script.php', '/mount.php', '/inc_api.php'])('%s → 410', async path => {
    const res = await request(app).get(path);
    expect(res.status).toBe(410);
  });
});

describe('/healthz', () => {
  it('reports ok when the database answers', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok' });
  });
  it('reports 503 when the database is down', async () => {
    const res = await request(appWith({ checkDb: async () => { throw new Error('x'); }, checkSphinx: async () => null })).get('/healthz');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error', db: 'down' });
  });
  it('includes sphinx when configured', async () => {
    const res = await request(appWith({ checkDb: async () => {}, checkSphinx: async () => 'down' })).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'degraded', db: 'ok', sphinx: 'down' });
  });
});
