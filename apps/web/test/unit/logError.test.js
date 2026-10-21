import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { logError, logEvent, errorText, setLogWriter } from '../../src/app/log.js';
import { AjaxController } from '../../src/app/controllers/AjaxController.js';
import { outputMiddleware } from '../../src/app/middleware/output.js';
import { ReferenceService } from '../../src/services/ReferenceService.js';

let lines, restore;
beforeEach(() => {
  lines = [];
  restore = setLogWriter(l => lines.push(l));
});
afterEach(() => setLogWriter(restore));

const records = () => lines.map(l => JSON.parse(l));

test('logError writes one JSON line with the context fields', () => {
  logError(new Error('boom'), { where: 'test', ref: 'john 3' });
  expect(lines).toHaveLength(1);
  const rec = records()[0];
  expect(rec).toMatchObject({ msg: 'error', where: 'test', ref: 'john 3', error: 'boom' });
  expect(rec.time).toMatch(/^\d{4}-\d\d-\d\dT/);
  expect(rec.stack).toContain('boom');
});

test('error text falls back to code, then name', () => {
  const coded = Object.assign(new Error(''), { code: 'ECONNREFUSED' });
  expect(errorText(coded)).toBe('ECONNREFUSED');
  const named = new TypeError('');
  expect(errorText(named)).toBe('TypeError');
  expect(errorText('plain string')).toBe('plain string');
});

test('an AggregateError (mysql2 trying ::1 and 127.0.0.1) lists the inner codes', () => {
  const inner = [
    Object.assign(new Error('connect ECONNREFUSED ::1:3306'), { code: 'ECONNREFUSED' }),
    Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3306'), { code: 'ECONNREFUSED' })
  ];
  const agg = Object.assign(new AggregateError(inner, ''), { code: 'ECONNREFUSED' });
  logError(agg, { where: 'db' });
  const rec = records()[0];
  expect(rec.error).toBe('ECONNREFUSED');
  expect(rec.code).toBe('ECONNREFUSED');
  expect(rec.errors).toEqual(['ECONNREFUSED', 'ECONNREFUSED']);
});

test('AjaxController failures log the request path', async () => {
  const controller = new AjaxController({});
  const app = express();
  app.get('/vbox', (req, res) => controller.fail(res, new Error('render failed')));
  const res = await request(app).get('/vbox?ref=john+3');
  expect(res.status).toBe(500);
  expect(records()).toEqual([expect.objectContaining({ msg: 'error', where: 'ajax', method: 'GET', path: '/vbox?ref=john+3', error: 'render failed' })]);
});

test('presenter failures log the format and path', async () => {
  const app = express();
  app.get('/x', (req, res) => {
    req.config = { outputFormat: 'html' };
    req.scriptureResult = new Proxy({}, { get() { throw new Error('bad result'); } });
    outputMiddleware(req, res);
  });
  // HtmlPresenter throws on the broken result; the middleware answers 500 and logs one line.
  const res = await request(app).get('/x');
  expect(res.status).toBe(500);
  expect(records()).toEqual([expect.objectContaining({ msg: 'error', where: 'presenter', format: 'html', path: '/x' })]);
});

test('ReferenceService logs index lookup failures with the reference', async () => {
  const svc = new ReferenceService({ findVerseIdsByIndex: () => { throw new Error('db down'); } });
  vi.spyOn(svc, 'resolveFromIndex').mockRejectedValue(new Error('db down'));
  await svc.resolve('zzz unknown 9');
  expect(records()).toEqual([expect.objectContaining({ msg: 'error', where: 'reference.index', ref: 'zzz unknown 9', error: 'db down' })]);
});

test('logEvent writes a JSON line with msg and fields (the startup line)', () => {
  logEvent('start', { port: 3000, env: 'production' });
  expect(records()[0]).toMatchObject({ msg: 'start', port: 3000, env: 'production' });
});

test('font configuration warnings default to JSON lines', async () => {
  const { fontsFromEnv } = await import('../../src/config/index.js');
  const { privateFontCss } = await import('../../src/presentation/fontFaces.js');
  const lines = [];
  const prev = setLogWriter(l => lines.push(l));
  try {
    fontsFromEnv({ FONT_BASE: '/' });
    privateFontCss(fontsFromEnv({ FONT_DIR: '/nonexistent-font-dir' }), { exists: () => false });
  } finally {
    setLogWriter(prev);
  }
  expect(lines.length).toBe(2);
  for (const line of lines) expect(JSON.parse(line)).toMatchObject({ msg: 'warn', message: expect.any(String) });
});
