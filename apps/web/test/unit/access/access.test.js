import { describe, test, expect, vi } from 'vitest';
import { createAccess } from '../../../src/app/access/access.js';
import { TIERS, KEY_TIERS, MODES } from '../../../src/app/access/policy.js';
import config from '../../../src/config/index.js';
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
  test('a key while the table does not exist → key tier, still counted by IP', async () => {
    const k = generateKey();
    const d = await make().access.check(req({ authorization: `Bearer ${k}` }), { scope: 'api' });
    expect(d).toMatchObject({ caller: 'ip:203.0.113.9', tier: 'key' });
  });
  test('while the table does not exist, fresh random keys share one bucket per IP', async () => {
    const { access } = make();
    for (let i = 0; i < 5; i++) expect((await access.check(req({ authorization: `Bearer ${generateKey()}` }), { scope: 'api' })).over).toBe(false);
    expect((await access.check(req({ authorization: `Bearer ${generateKey()}` }), { scope: 'api' })).over).toBe(true);
  });
  test('IPv6 callers are counted by /64; IPv4-mapped addresses as IPv4', async () => {
    const { access } = make();
    const a = await access.check(req({}, '2001:db8:abcd:12:1:2:3:4'), { scope: 'api' });
    expect(a.caller).toBe('ip6:2001:db8:abcd:12::/64');
    await access.check(req({}, '2001:db8:abcd:12:ffff::9'), { scope: 'api' });
    const c = await access.check(req({}, '2001:db8:abcd:12::77'), { scope: 'api' }); // limit 2: one bucket for the /64
    expect(c).toMatchObject({ caller: 'ip6:2001:db8:abcd:12::/64', over: true });
    expect((await access.check(req({}, '::ffff:198.51.100.7'), { scope: 'api' })).caller).toBe('ip:198.51.100.7');
  });
  test('no visitor IP and no known key: not counted', async () => {
    const { access, log } = make({ mode: 'enforce' });
    for (let i = 0; i < 5; i++) {
      expect(await access.check(req({}, null), { scope: 'api' })).toMatchObject({ caller: null, allowed: true, over: false, refused: false, headers: {} });
    }
    expect(log).not.toHaveBeenCalled();
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
  test('a key row with a tier keys cannot have is unknown, logged with its tier', async () => {
    const k = generateKey();
    const { access, keys, log } = make();
    keys.findByHash.mockResolvedValueOnce({ prefix: keyPrefix(k), tier: 'html' });
    expect((await access.check(req({ authorization: `Bearer ${k}` }), { scope: 'api' })).tier).toBe('anonymous');
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ msg: 'unknown_key', prefix: keyPrefix(k), tier: 'html' }));
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
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ msg: 'key_lookup_failed', error: 'down' }));
    // mysql2's AggregateError has an empty message: the code names it
    keys.findByHash.mockRejectedValueOnce(Object.assign(new AggregateError([], ''), { code: 'ECONNREFUSED' }));
    await access.check(req({ authorization: `Bearer ${generateKey()}` }), { scope: 'api' });
    expect(log).toHaveBeenLastCalledWith(expect.objectContaining({ msg: 'key_lookup_failed', error: 'ECONNREFUSED' }));
  });
  test('a revoked key is dropped once its cached lookup is older than 60 s', async () => {
    let t = 0;
    const k = generateKey();
    const { access, keys } = make({ now: () => t });
    keys.findByHash.mockResolvedValueOnce({ prefix: keyPrefix(k), tier: 'key' }).mockResolvedValue(null);
    const check = () => access.check(req({ authorization: `Bearer ${k}` }), { scope: 'api' });
    expect((await check()).caller).toBe(`key:${keyPrefix(k)}`);
    t = 59_999;
    expect((await check()).caller).toBe(`key:${keyPrefix(k)}`);
    t = 60_000;
    expect(await check()).toMatchObject({ caller: 'ip:203.0.113.9', tier: 'anonymous' });
    expect(keys.findByHash).toHaveBeenCalledTimes(2);
  });
  test('the key cache drops its oldest entry at the cap and keeps recently used keys', async () => {
    const [a, b, c] = [generateKey(), generateKey(), generateKey()];
    const { access, keys } = make({ keyCacheMax: 2 });
    keys.findByHash.mockResolvedValue({ prefix: 'x', tier: 'key' });
    const check = k => access.check(req({ authorization: `Bearer ${k}` }), { scope: 'api' });
    await check(a); await check(b);
    await check(a); // a is now the newest
    await check(c); // drops b
    expect(keys.findByHash).toHaveBeenCalledTimes(3);
    await check(a);
    expect(keys.findByHash).toHaveBeenCalledTimes(3);
    await check(b);
    expect(keys.findByHash).toHaveBeenCalledTimes(4);
  });
});

describe('createAccess: limits and modes', () => {
  test('observe: over the limit is logged, still allowed', async () => {
    const { access, log } = make();
    for (let i = 0; i < 2; i++) await access.check(req(), { scope: 'api' });
    const d = await access.check(req(), { scope: 'api' });
    expect(d).toMatchObject({ allowed: true, over: true, refused: false });
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ msg: 'rate_limit', mode: 'observe', caller: 'ip:203.0.113.9', scope: 'api', refused: false }));
  });
  test('rate_limit is logged when a caller first goes over, and again only after recovering', async () => {
    let t = 0;
    const { access, log } = make({ now: () => t });
    const rateLogs = () => log.mock.calls.filter(([r]) => r.msg === 'rate_limit').length;
    for (let i = 0; i < 6; i++) await access.check(req(), { scope: 'api' });
    expect(rateLogs()).toBe(1);
    t = 30_000; // one token back
    expect((await access.check(req(), { scope: 'api' })).over).toBe(false);
    expect((await access.check(req(), { scope: 'api' })).over).toBe(true);
    expect(rateLogs()).toBe(2);
  });
  test('enforce: over the limit is refused with retryAfter seconds', async () => {
    const { access } = make({ mode: 'enforce' });
    for (let i = 0; i < 2; i++) await access.check(req(), { scope: 'api' });
    expect(await access.check(req(), { scope: 'api' })).toMatchObject({ allowed: false, over: true, refused: true, retryAfter: 30 });
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
  test('keys can be issued only for key and internal', () => {
    expect(KEY_TIERS).toEqual(['key', 'internal']);
  });
  test('config.accessMode is one of MODES', () => {
    expect(MODES).toContain(config.accessMode);
  });
});
