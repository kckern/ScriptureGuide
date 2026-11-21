// Token buckets per caller, in memory (one app instance). A bucket holds up to `limit` tokens and
// refills at limit / windowMs. The map keeps insertion order; touching a caller moves it to the
// end, and past maxKeys the oldest is dropped, so memory stays bounded.
export class TokenBuckets {
  constructor({ maxKeys = 50_000 } = {}) {
    this.maxKeys = maxKeys;
    this.map = new Map();
  }

  get size() { return this.map.size; }

  // → { ok, remaining, retryAfterMs, resetMs }
  take(id, { limit, windowMs }, now = Date.now()) {
    if (limit === Infinity) return { ok: true, remaining: Infinity, retryAfterMs: 0, resetMs: 0 };
    const rate = limit / windowMs; // tokens per ms
    let b = this.map.get(id);
    if (b) {
      this.map.delete(id);
      b.tokens = Math.min(limit, b.tokens + (now - b.at) * rate);
      b.at = now;
    } else {
      b = { tokens: limit, at: now };
    }
    this.map.set(id, b);
    if (this.map.size > this.maxKeys) this.map.delete(this.map.keys().next().value);
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    const remaining = Math.floor(b.tokens);
    return {
      ok,
      remaining,
      retryAfterMs: ok ? 0 : Math.ceil((1 - b.tokens) / rate),
      resetMs: Math.ceil((limit - b.tokens) / rate),
    };
  }
}
