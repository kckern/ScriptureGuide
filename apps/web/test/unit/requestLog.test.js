import { test, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requestLog } from '../../src/app/middleware/requestLog.js';
import { createErrorHandler } from '../../src/app/middleware/error.js';

test('one JSON line per request with the fields log queries need', async () => {
  const lines = [];
  const app = express();
  app.use(requestLog({ write: l => lines.push(l) }));
  app.get('/x', (req, res) => { req.config = { outputFormat: 'api' }; res.status(201).send('ok'); });
  await request(app).get('/x?q=1').set('Host', 'api.scripture.guide').set('User-Agent', 'ua');
  const rec = JSON.parse(lines[0]);
  expect(rec).toMatchObject({ msg: 'request', method: 'GET', path: '/x?q=1', host: 'api.scripture.guide', status: 201, format: 'api', ua: 'ua' });
  expect(typeof rec.duration_ms).toBe('number');
  expect(rec.time).toMatch(/^\d{4}-\d\d-\d\dT/);
});

test('bytes is the Content-Length as a number; missing headers are null', async () => {
  const lines = [];
  const app = express();
  app.use(requestLog({ write: l => lines.push(l) }));
  app.get('/x', (req, res) => res.send('hello'));
  await request(app).get('/x').set('Referer', 'https://example.com/');
  expect(lines).toHaveLength(1);
  const rec = JSON.parse(lines[0]);
  expect(rec.bytes).toBe(5);
  expect(rec.referer).toBe('https://example.com/');
  expect(rec.format).toBeNull();
  expect(typeof rec.ip).toBe('string');
  expect(rec).not.toHaveProperty('aborted');
});

test('format falls back to the subdomain format before configMiddleware has run', async () => {
  const lines = [];
  const app = express();
  app.use(requestLog({ write: l => lines.push(l) }));
  app.use((req, res) => { req.outputFormat = 'meta'; res.status(404).end(); });
  await request(app).get('/nowhere');
  expect(JSON.parse(lines[0])).toMatchObject({ status: 404, format: 'meta', path: '/nowhere' });
});

test('health checks are not logged', async () => {
  const lines = [];
  const app = express();
  app.use(requestLog({ write: l => lines.push(l) }));
  app.get(['/health', '/healthz'], (req, res) => res.send('ok'));
  await request(app).get('/health');
  await request(app).get('/healthz?x=1');
  expect(lines).toEqual([]);
});

test('a request the client abandons is logged once, marked aborted', async () => {
  const lines = [];
  const app = express();
  app.use(requestLog({ write: l => lines.push(l) }));
  let closed;
  const done = new Promise(r => { closed = r; });
  app.get('/slow', (req, res) => { res.on('close', () => setImmediate(closed)); });
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const http = await import('node:http');
    const req = http.get({ port, path: '/slow' });
    req.on('error', () => {});
    setTimeout(() => req.destroy(), 50);
    await done;
  } finally {
    server.close();
  }
  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0])).toMatchObject({ msg: 'request', path: '/slow', aborted: true, status: 200 });
});

test('errors log one JSON line with the message and stack', async () => {
  const lines = [];
  const app = express();
  app.get('/boom', () => { throw new Error('kaboom'); });
  app.use(createErrorHandler({ write: l => lines.push(l) }));
  const res = await request(app).get('/boom').set('Accept', 'application/json');
  expect(res.status).toBe(500);
  expect(lines).toHaveLength(1);
  const rec = JSON.parse(lines[0]);
  expect(rec).toMatchObject({ msg: 'error', method: 'GET', path: '/boom', status: 500, error: 'kaboom' });
  expect(rec.stack).toContain('kaboom');
  expect(rec.time).toMatch(/^\d{4}-\d\d-\d\dT/);
});
