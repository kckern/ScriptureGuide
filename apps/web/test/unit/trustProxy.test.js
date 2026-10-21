import { test, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { TRUST_PROXY } from '../../src/app/trustProxy.js';

// Production path: Cloudflare edge -> AWS ALB (private) -> nginx-proxy-manager (docker) -> app.
// X-Forwarded-For reaching the app: "<client>, <cloudflare edge>, <alb>"; the socket peer is NPM.
function appWithTrust() {
  const app = express();
  app.set('trust proxy', TRUST_PROXY);
  app.get('/ip', (req, res) => res.send(req.ip));
  return app;
}

test('req.ip is the visitor behind Cloudflare, the ALB and nginx-proxy-manager', async () => {
  const res = await request(appWithTrust()).get('/ip').set('X-Forwarded-For', '198.51.100.7, 162.158.10.20, 10.0.1.5');
  expect(res.text).toBe('198.51.100.7');
});

test('a forged X-Forwarded-For entry before an untrusted client is ignored', async () => {
  const res = await request(appWithTrust()).get('/ip').set('X-Forwarded-For', '203.0.113.66, 198.51.100.7, 10.0.1.5');
  expect(res.text).toBe('198.51.100.7');
});

test('IPv6 visitors through Cloudflare', async () => {
  const res = await request(appWithTrust()).get('/ip').set('X-Forwarded-For', '2001:db8::1, 2606:4700::6810:1, 10.0.1.5');
  expect(res.text).toBe('2001:db8::1');
});

// Documents the known gap in trustProxy.js: NPM's `real_ip_header X-Real-IP` lets a visitor-supplied
// X-Real-IP stand in for the ALB hop. The app cannot tell it from a real hop; Cloudflare must strip
// the header. Until then req.ip is the forged value and the log's xff keeps the full chain.
test('known gap: a visitor X-Real-IP that NPM swaps in for the ALB hop becomes req.ip', async () => {
  const res = await request(appWithTrust()).get('/ip').set('X-Forwarded-For', '198.51.100.7, 162.158.10.20, 203.0.113.66');
  expect(res.text).toBe('203.0.113.66');
});

// With trust proxy on, Express's req.hostname honours X-Forwarded-Host. Format and subdomain routing
// read the Host header first, so a visitor-supplied X-Forwarded-Host cannot switch the output format.
test('X-Forwarded-Host cannot change the subdomain or output format', async () => {
  const { subdomainMiddleware } = await import('../../src/app/middleware/subdomain.js');
  const { configMiddleware } = await import('../../src/app/middleware/config.js');
  const app = express();
  app.set('trust proxy', TRUST_PROXY);
  app.use(subdomainMiddleware, configMiddleware);
  app.get('*', (req, res) => res.json({ sub: req.outputFormat, format: req.config.outputFormat }));
  const plain = await request(app).get('/kjv/john.3.16').set('Host', 'scripture.guide').set('X-Forwarded-Host', 'api.scripture.guide');
  expect(plain.body).toEqual({ sub: 'html', format: 'html' });
  const api = await request(app).get('/kjv/john.3.16').set('Host', 'api.scripture.guide').set('X-Forwarded-Host', 'scripture.guide');
  expect(api.body).toEqual({ sub: 'api', format: 'api' });
  const gone = await request(app).get('/x').set('Host', 'scripture.guide').set('X-Forwarded-Host', 'hub.scripture.guide');
  expect(gone.status).toBe(200);
});
