import { describe, test, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { publicStatic, privacyPolicy } from '../../src/app/middleware/static.js';

// The Chrome Web Store links here as the extension's privacy policy and checks it is reachable.
describe('/privacy.html', () => {
  const app = express().use(publicStatic()).use(privacyPolicy());
  test('is served as HTML to any client, crawlers included', async () => {
    const res = await request(app).get('/privacy.html').set('User-Agent', 'Googlebot/2.1');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('Scripture Guide Chrome extension');
    expect(res.text).toMatch(/does not collect/i);
  });
});

describe('/privacy-policy', () => {
  const app = express().use(publicStatic()).use(privacyPolicy());
  test.each(['/privacy-policy', '/privacy-policy/'])('%s serves the same page', async (url) => {
    const res = await request(app).get(url).set('User-Agent', 'Googlebot/2.1');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('Scripture Guide Chrome extension');
  });
});
