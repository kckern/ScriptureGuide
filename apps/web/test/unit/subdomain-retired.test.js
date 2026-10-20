import { describe, it, expect } from 'vitest';
import subdomainMiddleware from '../../src/app/middleware/subdomain.js';

function run(hostname, path = '/john.3.16') {
  const out = { status: null, body: null, type: null, location: null, next: false };
  const res = {
    status(s) { out.status = s; return res; },
    type(t) { out.type = t; return res; },
    send(b) { out.body = b; return res; },
    redirect(s, url) { out.status = s; out.location = url; return res; },
  };
  const req = { hostname, path, method: 'GET' };
  subdomainMiddleware(req, res, () => { out.next = true; });
  return { out, req };
}

describe('retired and cover subdomains', () => {
  it('answers 410 Gone for hub and slide', () => {
    for (const host of ['hub.scripture.guide', 'slide.scripture.guide']) {
      const { out } = run(host);
      expect(out.status).toBe(410);
      expect(out.type).toBe('text/plain');
      expect(out.body).toMatch(/no longer available/);
      expect(out.next).toBe(false);
    }
  });

  it('sends cover names straight to the image and references on to the lookup', () => {
    let { out } = run('cover.scripture.guide', '/ldskjv');
    expect(out.location).toBe('https://media.scripture.guide/covers/ldskjv.jpg');
    const r = run('cover.scripture.guide', '/john.3.16');
    expect(r.out.next).toBe(true);
    expect(r.req.outputFormat).toBe('cover');
    ({ out } = run('scripture.guide'));
    expect(out.next).toBe(true);
  });
});
