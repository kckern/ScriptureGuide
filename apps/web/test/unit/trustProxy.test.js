import { test, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { TRUST_PROXY } from '../../src/app/trustProxy.js';

// Production path today: CloudFront -> nginx on bom (nginx-proxy-manager, docker) -> app. CloudFront
// is not trusted, so req.ip is the CloudFront edge. The Cloudflare cases below use the trusted
// Cloudflare ranges and private hops: "<client>, <cloudflare edge>, <private hop>". After the move
// to Cloudflare Tunnel every hop is private and the visitor comes from CF-Connecting-IP (clientIp.js).
function appWithTrust() {
  const app = express();
  app.set('trust proxy', TRUST_PROXY);
  app.get('/ip', (req, res) => res.send(req.ip));
  return app;
}

test('today: req.ip stops at the CloudFront edge, which is not trusted', async () => {
  const res = await request(appWithTrust()).get('/ip').set('X-Forwarded-For', '198.51.100.7, 18.68.1.2');
  expect(res.text).toBe('18.68.1.2');
});

test('req.ip is the visitor behind a Cloudflare edge and private hops', async () => {
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

// Documents the known gap in trustProxy.js: nginx-proxy-manager's `real_ip_header X-Real-IP` lets a
// visitor-supplied X-Real-IP stand in for the hop in front of nginx. The app cannot tell it from a
// real hop, and req.ip decides the rate-limit identity, so the edge must strip the header. Until
// then req.ip is the forged value and the log's xff keeps the full chain.
test('known gap: a visitor X-Real-IP that nginx swaps in for the hop in front becomes req.ip', async () => {
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
  const plain = await request(app).get('/kjv/john.3.16').set('Host', 'scripture.guide').set('X-Forwarded-Host', 'meta.scripture.guide');
  expect(plain.body).toEqual({ sub: 'html', format: 'html' });
  const meta = await request(app).get('/kjv/john.3.16').set('Host', 'meta.scripture.guide').set('X-Forwarded-Host', 'scripture.guide');
  expect(meta.body).toEqual({ sub: 'meta', format: 'meta' });
  const gone = await request(app).get('/x').set('Host', 'scripture.guide').set('X-Forwarded-Host', 'hub.scripture.guide');
  expect(gone.status).toBe(200);
});
