import { describe, test, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// No database: every query finds nothing.
vi.mock('../../src/data/db/connection.js', () => ({ default: { query: async () => [[]], execute: async () => [[]] } }));
const { default: router } = await import('../../src/app/routes/index.js');

const app = express().use(router);
const get = (host, path) => request(app).get(path).set('Host', host).buffer(true).parse((res, cb) => {
  let s = ''; res.on('data', c => { s += c; }); res.on('end', () => cb(null, s));
});

// index.php dispatched by subdomain before its empty($ref) → home.php check, so these
// formats answer an empty reference in their own format (PHP blankData for one empty block).
describe('an empty reference on a non-HTML host', () => {
  test('meta: one empty block', async () => {
    const res = await get('meta.scripture.guide', '/');
    expect(JSON.parse(res.body)).toEqual([{ orig: '', book: '', verse_ids: false }]);
  });
  test('raw: null', async () => {
    expect((await get('raw.scripture.guide', '/press/')).body).toBe('null');
  });
  // plain. is the v1 text host (src/api/v1/router.js); the /plain/ prefix still reaches this
  test('plain: the not-found text', async () => {
    expect((await get('scripture.guide', '/plain/')).body).toBe('No scripture verses found.');
  });
  test('latex: an empty body', async () => {
    const res = await get('latex.scripture.guide', '/');
    expect(res.status).toBe(200);
    expect(res.body).toBe('');
  });
});

// PHP's empty() is true for "0", so /0 is an empty reference too.
describe('"0" is an empty reference (PHP empty)', () => {
  test('meta gives the empty block', async () => {
    expect(JSON.parse((await get('meta.scripture.guide', '/0')).body)).toEqual([{ orig: '', book: '', verse_ids: false }]);
  });
});

