import { describe, test, expect, vi } from 'vitest';
import { createAccess } from '../../../src/app/access/access.js';
import { TIERS } from '../../../src/app/access/policy.js';
import { generateKey, keyPrefix } from '../../../src/app/access/keys.js';

const req = (headers = {}, ip = '203.0.113.9') => ({ ip, headers, method: 'GET', originalUrl: '/v1/john3.16' });
const tiny = { anonymous: { limit: 2, windowMs: 60_000 }, key: { limit: 5, windowMs: 60_000 }, internal: { limit: Infinity, windowMs: 60_000 }, html: { limit: 2, windowMs: 60_000 } };

function make(opts = {}) {
  const log = vi.fn();
  const keys = { findByHash: vi.fn(async () => undefined) };
  const access = createAccess({ mode: 'observe', tiers: tiny, keys, log, now: () => 0, ...opts });
  return { access, log, keys };
}

describe('createAccess: identity', () => {
  test('no key → anonymous, by visitor IP', async () => {
    const d = await make().access.check(req(), { scope: 'api' });
    expect(d).toMatchObject({ caller: 'ip:203.0.113.9', tier: 'anonymous', allowed: true });
  });
  test('a key while the table does not exist → keyed caller', async () => {
    const k = generateKey();
    const d = await make().access.check(req({ authorization: `Bearer ${k}` }), { scope: 'api' });
    expect(d).toMatchObject({ caller: `key:${keyPrefix(k)}`, tier: 'key' });
  });
  test('a known key takes its tier; an unknown one is anonymous and logged', async () => {
    const k = generateKey(), unknown = generateKey(); // two keys: the first answer is cached
    const { access, keys, log } = make();
    keys.findByHash.mockResolvedValueOnce({ prefix: keyPrefix(k), tier: 'internal' });
    expect((await access.check(req({ authorization: `Bearer ${k}` }), { scope: 'api' })).tier).toBe('internal');
    keys.findByHash.mockResolvedValueOnce(null);
    expect((await access.check(req({ authorization: `Bearer ${unknown}` }), { scope: 'api' })).tier).toBe('anonymous');
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ msg: 'unknown_key', prefix: keyPrefix(unknown) }));
  });
  test('key lookups are cached for a while', async () => {
    const k = generateKey();
    const { access, keys } = make();
    await access.check(req({ authorization: `Bearer ${k}` }), { scope: 'api' });
    await access.check(req({ authorization: `Bearer ${k}` }), { scope: 'api' });
    expect(keys.findByHash).toHaveBeenCalledTimes(1);
  });
  test('a key lookup error does not fail the request: anonymous, logged', async () => {
    const k = generateKey();
    const { access, keys, log } = make();
    keys.findByHash.mockRejectedValueOnce(new Error('down'));
    expect((await access.check(req({ authorization: `Bearer ${k}` }), { scope: 'api' })).tier).toBe('anonymous');
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ msg: 'key_lookup_failed' }));
  });
});

describe('createAccess: limits and modes', () => {
  test('observe: over the limit is logged, still allowed', async () => {
    const { access, log } = make();
    for (let i = 0; i < 2; i++) await access.check(req(), { scope: 'api' });
    const d = await access.check(req(), { scope: 'api' });
    expect(d).toMatchObject({ allowed: true, over: true });
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ msg: 'rate_limit', mode: 'observe', caller: 'ip:203.0.113.9', scope: 'api' }));
  });
  test('enforce: over the limit is refused with retryAfter seconds', async () => {
    const { access } = make({ mode: 'enforce' });
    for (let i = 0; i < 2; i++) await access.check(req(), { scope: 'api' });
    expect(await access.check(req(), { scope: 'api' })).toMatchObject({ allowed: false, over: true, retryAfter: 30 });
  });
  test('html scope is never refused, even in enforce', async () => {
    const { access } = make({ mode: 'enforce' });
    for (let i = 0; i < 5; i++) await access.check(req(), { scope: 'html' });
    expect((await access.check(req(), { scope: 'html' })).allowed).toBe(true);
  });
  test('html and api are counted apart', async () => {
    const { access } = make({ mode: 'enforce' });
    for (let i = 0; i < 2; i++) await access.check(req(), { scope: 'html' });
    expect((await access.check(req(), { scope: 'api' })).over).toBe(false);
  });
  test('off: no counting, no headers', async () => {
    const d = await make({ mode: 'off' }).access.check(req(), { scope: 'api' });
    expect(d).toMatchObject({ allowed: true, over: false, headers: {} });
  });
  test('headers follow the IETF RateLimit fields', async () => {
    const d = await make().access.check(req(), { scope: 'api' });
    expect(d.headers['RateLimit-Policy']).toBe('"anonymous";q=2;w=60');
    expect(d.headers.RateLimit).toMatch(/^"anonymous";r=1;t=\d+$/);
  });
  test('unlimited tiers send no RateLimit headers', async () => {
    const k = generateKey();
    const { access, keys } = make();
    keys.findByHash.mockResolvedValueOnce({ prefix: keyPrefix(k), tier: 'internal' });
    expect((await access.check(req({ authorization: `Bearer ${k}` }), { scope: 'api' })).headers).toEqual({});
  });
});

describe('TIERS defaults', () => {
  test('placeholders until observe data is in', () => {
    expect(TIERS.anonymous.limit).toBe(60);
    expect(TIERS.key.limit).toBe(600);
    expect(TIERS.internal.limit).toBe(Infinity);
    expect(TIERS.html.limit).toBe(120);
  });
});
