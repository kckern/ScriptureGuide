import { describe, test, expect, vi } from 'vitest';
import request from 'supertest';

// Every query answers with no rows: enough to reach each format's presenter (or its
// not-found / error answer) through the real middleware stack.
vi.mock('../../src/data/db/connection.js', () => ({ default: { query: async () => [] } }));

const { createApp } = await import('../../src/app/createApp.js');
const app = createApp({ log: false });

// Owner decision #29 (2026-10-22): every format and page is usable cross-site, as on live.
const CASES = [
  ['html page', 'scripture.guide', '/john.3.16'],
  ['home page', 'scripture.guide', '/'],
  ['api JSON', 'api.scripture.guide', '/john.3.16'],
  ['raw', 'raw.scripture.guide', '/john.3.16'],
  ['plain', 'plain.scripture.guide', '/john.3.16'],
  ['markdown', 'markdown.scripture.guide', '/john.3.16'],
  ['static asset', 'scripture.guide', '/js/main.js'],
  ['AJAX /vbox', 'scripture.guide', '/vbox?verse_id=26137&ver=LDS&seq=1'],
  ['not found page', 'scripture.guide', '/no/such/page/at/all'],
];

describe('response headers', () => {
  test.each(CASES)('%s (%s%s)', async (_name, host, path) => {
    const res = await request(app).get(path).set('Host', host);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    // Other sites can embed covers, API output and assets.
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    // Pages opened by other sites (popups) keep their opener, as on live.
    expect(res.headers['cross-origin-opener-policy']).toBeUndefined();
    // Kept from helmet.
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
