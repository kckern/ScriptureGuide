import { describe, test, expect } from 'vitest';
import { TokenBuckets } from '../../../src/app/access/buckets.js';

describe('TokenBuckets', () => {
  test('a full bucket allows `limit` takes, then refuses', () => {
    const b = new TokenBuckets();
    const p = { limit: 3, windowMs: 60_000 };
    expect([1, 2, 3].map(() => b.take('a', p, 0).ok)).toEqual([true, true, true]);
    const r = b.take('a', p, 0);
    expect(r).toMatchObject({ ok: false, remaining: 0 });
    expect(r.retryAfterMs).toBe(20_000); // one token every 20 s
  });
  test('tokens refill over time, never past the limit', () => {
    const b = new TokenBuckets();
    const p = { limit: 3, windowMs: 60_000 };
    for (let i = 0; i < 3; i++) b.take('a', p, 0);
    expect(b.take('a', p, 20_000).ok).toBe(true);
    expect(b.take('a', p, 10 * 60_000).remaining).toBe(2);
  });
  test('callers are counted apart', () => {
    const b = new TokenBuckets();
    const p = { limit: 1, windowMs: 60_000 };
    expect(b.take('a', p, 0).ok).toBe(true);
    expect(b.take('b', p, 0).ok).toBe(true);
    expect(b.take('a', p, 0).ok).toBe(false);
  });
  test('the map is capped: the oldest caller is dropped', () => {
    const b = new TokenBuckets({ maxKeys: 2 });
    const p = { limit: 1, windowMs: 60_000 };
    b.take('a', p, 0); b.take('b', p, 1); b.take('c', p, 2);
    expect(b.size).toBe(2);
    expect(b.take('a', p, 3).ok).toBe(true); // forgotten, so full again
  });
  test('an unlimited policy always allows', () => {
    expect(new TokenBuckets().take('a', { limit: Infinity, windowMs: 60_000 }, 0)).toMatchObject({ ok: true, remaining: Infinity });
  });
  test('resetMs is the time until the bucket is full again', () => {
    const b = new TokenBuckets();
    const p = { limit: 60, windowMs: 60_000 };
    b.take('a', p, 0);
    expect(b.take('a', p, 0).resetMs).toBe(2_000);
  });
  test('a clock step back neither removes nor adds tokens', () => {
    const b = new TokenBuckets();
    const p = { limit: 3, windowMs: 60_000 };
    b.take('a', p, 60_000); // 2 left
    expect(b.take('a', p, 0)).toMatchObject({ ok: true, remaining: 1 });
    // back at 60 s: no time has passed since the newest reading, so no refill
    expect(b.take('a', p, 60_000)).toMatchObject({ ok: true, remaining: 0 });
  });
});
