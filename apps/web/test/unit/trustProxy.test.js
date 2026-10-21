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
