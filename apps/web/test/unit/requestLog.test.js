import { test, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requestLog } from '../../src/app/middleware/requestLog.js';
import { createErrorHandler } from '../../src/app/middleware/error.js';
import compression from 'compression';
import http from 'node:http';

// Raw GET (no decompression) so the test sees the bytes on the wire.
function rawGet(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({ port, path, headers }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ res, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

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

test('bytes is the body size sent; missing headers are null', async () => {
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
  expect(rec.cf_ray).toBeNull();
  expect(rec.xff).toBeNull();
});

test('logs the Cloudflare ray id and the raw X-Forwarded-For chain', async () => {
  const lines = [];
  const app = express();
  app.use(requestLog({ write: l => lines.push(l) }));
  app.get('/x', (req, res) => res.send('ok'));
  await request(app).get('/x').set('CF-Ray', '8d1f2e3a4b5c6d7e-SJC').set('X-Forwarded-For', '198.51.100.7, 162.158.10.20');
  expect(JSON.parse(lines[0])).toMatchObject({ cf_ray: '8d1f2e3a4b5c6d7e-SJC', xff: '198.51.100.7, 162.158.10.20' });
});

test('bytes is the compressed size on the wire when the response is gzipped', async () => {
  const lines = [];
  const app = express();
  app.use(requestLog({ write: l => lines.push(l) }));
  app.use(compression());
  app.get('/big', (req, res) => res.type('text').send('In the beginning God created the heaven and the earth. '.repeat(400)));
  const server = app.listen(0);
  try {
    const { res, body } = await rawGet(server.address().port, '/big', { 'Accept-Encoding': 'gzip' });
    expect(res.headers['content-encoding']).toBe('gzip');
    await new Promise(r => setImmediate(r));
    const rec = JSON.parse(lines[0]);
    expect(rec.bytes).toBe(body.length);
    expect(rec.bytes).toBeLessThan(2000);
  } finally {
    server.close();
  }
});

test('bytes counts a streamed response written in pieces', async () => {
  const lines = [];
  const app = express();
  app.use(requestLog({ write: l => lines.push(l) }));
  app.get('/stream', (req, res) => { res.write('abc'); res.write(Buffer.from('défg')); res.end('h'); });
  await request(app).get('/stream');
  expect(JSON.parse(lines[0]).bytes).toBe(3 + Buffer.byteLength('défg') + 1);
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
    const req = http.get({ port, path: '/slow' });
    req.on('error', () => {});
    setTimeout(() => req.destroy(), 50);
    await done;
  } finally {
    server.close();
  }
  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0])).toMatchObject({ msg: 'request', path: '/slow', aborted: true, status: null });
});

test('an aborted request that already sent its headers keeps that status', async () => {
  const lines = [];
  const app = express();
  app.use(requestLog({ write: l => lines.push(l) }));
  let closed;
  const done = new Promise(r => { closed = r; });
  app.get('/partial', (req, res) => {
    res.on('close', () => setImmediate(closed));
    res.status(206).write('part');
  });
  const server = app.listen(0);
  try {
    const req = http.get({ port: server.address().port, path: '/partial' }, res => {
      res.once('data', () => req.destroy());
    });
    req.on('error', () => {});
    await done;
  } finally {
    server.close();
  }
  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0])).toMatchObject({ aborted: true, status: 206, bytes: 4 });
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

test('the error handler names an error without a message by its code', async () => {
  const lines = [];
  const app = express();
  app.get('/db', () => {
    const inner = [Object.assign(new Error('connect ECONNREFUSED ::1:3306'), { code: 'ECONNREFUSED' })];
    throw Object.assign(new AggregateError(inner, ''), { code: 'ECONNREFUSED' });
  });
  app.use(createErrorHandler({ write: l => lines.push(l) }));
  await request(app).get('/db').set('Accept', 'application/json');
  expect(JSON.parse(lines[0])).toMatchObject({ msg: 'error', path: '/db', status: 500, error: 'ECONNREFUSED', code: 'ECONNREFUSED', errors: ['ECONNREFUSED'] });
});
