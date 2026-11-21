// The access check for API and HTML requests.
// check(req, { scope }) → { caller, tier, allowed, over, retryAfter, headers }.
// Callers: "key:<prefix>" for an API key, else "ip:<visitor IP>". Keys are looked up only once
// the api_keys table exists; until then any well-formed key counts as a keyed caller.
// Modes: off (nothing), observe (count and log, never refuse), enforce (refuse over the limit;
// API only: HTML is never refused here).
import { TokenBuckets } from './buckets.js';
import { TIERS, KEY_TIERS } from './policy.js';
import { parseBearer, hashKey, keyPrefix } from './keys.js';
import { clientIp } from '../clientIp.js';
import apiKeyRepository from '../../data/repositories/ApiKeyRepository.js';
import { writeLine } from '../log.js';

const KEY_CACHE_MS = 5 * 60_000;

export function createAccess({ mode = 'observe', tiers = TIERS, keyTiers = KEY_TIERS, keys = apiKeyRepository, log = rec => writeLine(JSON.stringify(rec)), now = Date.now, buckets = new TokenBuckets() } = {}) {
  const keyCache = new Map(); // hash → { row, at }

  async function lookup(key) {
    const hash = hashKey(key);
    const hit = keyCache.get(hash);
    if (hit && now() - hit.at < KEY_CACHE_MS) return hit.row;
    const row = await keys.findByHash(hash);
    if (keyCache.size > 10_000) keyCache.clear();
    keyCache.set(hash, { row, at: now() });
    return row;
  }

  async function identify(req) {
    const key = parseBearer(req.headers?.authorization);
    const ipCaller = { caller: `ip:${clientIp(req) ?? 'unknown'}`, tier: 'anonymous' };
    if (!key) return ipCaller;
    const prefix = keyPrefix(key);
    let row;
    try { row = await lookup(key); } catch (err) {
      log({ time: new Date(now()).toISOString(), msg: 'key_lookup_failed', prefix, error: String(err?.message ?? err) });
      return ipCaller;
    }
    if (row === undefined) return { caller: `key:${prefix}`, tier: 'key' }; // no table yet
    if (row === null || !keyTiers.includes(row.tier) || !tiers[row.tier]) {
      log({ time: new Date(now()).toISOString(), msg: 'unknown_key', prefix, ...(row ? { tier: row.tier } : {}) });
      return ipCaller;
    }
    return { caller: `key:${prefix}`, tier: row.tier };
  }

  return {
    mode,
    async check(req, { scope = 'api' } = {}) {
      if (mode === 'off') return { caller: null, tier: null, allowed: true, over: false, retryAfter: 0, headers: {} };
      const who = await identify(req);
      const tierName = scope === 'html' ? 'html' : who.tier;
      const policy = tiers[tierName];
      const r = buckets.take(`${scope}|${who.caller}`, policy, now());
      const over = !r.ok;
      const allowed = !over || mode !== 'enforce' || scope === 'html';
      const retryAfter = Math.ceil(r.retryAfterMs / 1000);
      if (over) log({ time: new Date(now()).toISOString(), msg: 'rate_limit', mode, scope, caller: who.caller, tier: tierName, method: req.method, path: req.originalUrl, refused: !allowed });
      const headers = policy.limit === Infinity ? {} : {
        'RateLimit-Policy': `"${tierName}";q=${policy.limit};w=${Math.round(policy.windowMs / 1000)}`,
        RateLimit: `"${tierName}";r=${r.remaining};t=${Math.ceil(r.resetMs / 1000)}`,
      };
      return { ...who, tier: tierName, allowed, over, retryAfter, headers };
    },
  };
}
