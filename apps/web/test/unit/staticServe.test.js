import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
  it('lets browsers keep assets for an hour instead of revalidating on every page', async () => {
    // Live sends no Cache-Control, so browsers kept its year-old assets by heuristic; max-age=0
    // made every page view revalidate each asset
    const res = await request(app).get('/css/style.css');
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
  });
  it('leaves other types alone', async () => {
    const res = await request(app).get('/js/main.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/javascript/);
  });
  it('matches the .ico extension case-insensitively', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sg-static-'));
    writeFileSync(path.join(dir, 'ICON.ICO'), Buffer.from([0, 0, 1, 0]));
    const res = await request(express().use(publicStatic(dir))).get('/ICON.ICO');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/vnd.microsoft.icon');
  });
});
