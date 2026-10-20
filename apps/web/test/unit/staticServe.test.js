import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { publicStatic } from '../../src/app/middleware/static.js';

const app = express().use(publicStatic());

describe('public static files', () => {
  it('serves favicon.ico as image/vnd.microsoft.icon (as live does)', async () => {
    const res = await request(app).get('/favicon.ico').buffer(true).parse((r, cb) => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/vnd.microsoft.icon');
    expect(Buffer.compare(res.body, readFileSync(new URL('../../public/favicon.ico', import.meta.url)))).toBe(0);
  });
  it('leaves other types alone', async () => {
    const res = await request(app).get('/js/main.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/javascript/);
  });
});
