// The access check for API and HTML requests.
// check(req, { scope }) → { caller, tier, allowed, over, refused, retryAfter, headers }.
// Callers: "key:<prefix>" for a known API key, else the visitor's address: "ip:<IPv4>", or
// "ip6:<network>/64" for IPv6 ("ip6:2001:db8::/64", RFC 5952), since one host often holds a
// whole /64. Keys are looked up only once the api_keys table exists; until then a well-formed
// key gets the key tier's limit but is still counted by address, so making up fresh keys never
// gives fresh buckets.
// A request with no visitor address and no known key is not counted.
// Modes: off (nothing), observe (count and log, never refuse), enforce (refuse over the limit;
// API only: HTML is never refused here). A caller's rate_limit line is logged when they first go
// over, and again only after they were allowed in between.
import ipaddr from 'ipaddr.js';
import { TokenBuckets } from './buckets.js';
import { TIERS, KEY_TIERS } from './policy.js';
import { parseBearer, hashKey, keyPrefix } from './keys.js';
import { clientIp } from '../clientIp.js';
import apiKeyRepository from '../../data/repositories/ApiKeyRepository.js';
import { logEvent, errorText } from '../log.js';

const KEY_CACHE_MS = 60_000; // a revoked key stops working within this long
const uncounted = () => ({ caller: null, tier: null, allowed: true, over: false, refused: false, retryAfter: 0, headers: {} });

// "ip:<IPv4>" | "ip6:<the /64 network, compressed>/64" | null
export function addressCaller(ip) {
  if (!ip) return null;
  let addr;
  try { addr = ipaddr.parse(ip); } catch { return `ip:${ip}`; }
  if (addr.kind() === 'ipv6' && addr.isIPv4MappedAddress()) addr = addr.toIPv4Address();
  if (addr.kind() === 'ipv4') return `ip:${addr.toString()}`;
  // The /64 network, compressed (RFC 5952): "ip6:2001:db8::/64", "ip6:::/64" for ::1
  return `ip6:${new ipaddr.IPv6([...addr.parts.slice(0, 4), 0, 0, 0, 0]).toRFC5952String()}/64`;
}

export function createAccess({
  mode = 'observe',
  tiers = TIERS,
  keyTiers = KEY_TIERS,
  keys = apiKeyRepository,
  log = ({ msg, ...fields }) => logEvent(msg, fields),
  now = Date.now,
  buckets = new TokenBuckets(),
  keyCacheMax = 10_000,
} = {}) {
  const keyCache = new Map(); // hash → { row, at }, oldest use first

  async function lookup(key) {
    const hash = hashKey(key);
    const hit = keyCache.get(hash);
    if (hit) {
      keyCache.delete(hash);
      if (now() - hit.at < KEY_CACHE_MS) {
        keyCache.set(hash, hit); // now the most recently used
        return hit.row;
      }
    }
    const row = await keys.findByHash(hash);
    keyCache.set(hash, { row, at: now() });
    if (keyCache.size > keyCacheMax) keyCache.delete(keyCache.keys().next().value);
    return row;
  }

  async function identify(req) {
    const key = parseBearer(req.headers?.authorization);
    const ipCaller = { caller: addressCaller(clientIp(req)), tier: 'anonymous' };
    if (!key) return ipCaller;
    const prefix = keyPrefix(key);
    let row;
    try { row = await lookup(key); } catch (err) {
      log({ msg: 'key_lookup_failed', prefix, error: errorText(err) });
      return ipCaller;
    }
    if (row === undefined) return { caller: ipCaller.caller, tier: 'key' }; // no table yet
    if (row === null || !keyTiers.includes(row.tier) || !tiers[row.tier]) {
      log({ msg: 'unknown_key', prefix, ...(row ? { tier: row.tier } : {}) });
      return ipCaller;
    }
    return { caller: `key:${prefix}`, tier: row.tier };
  }

  return {
    mode,
    async check(req, { scope = 'api' } = {}) {
      if (mode === 'off') return uncounted();
      const who = await identify(req);
      if (!who.caller) return uncounted();
      const tierName = scope === 'html' ? 'html' : who.tier;
      const policy = tiers[tierName];
      // The tier is part of the bucket id: before keys are live, one address can be both an
      // anonymous caller and a key-tier caller, each with its own limit.
      const r = buckets.take(`${scope}|${tierName}|${who.caller}`, policy, now());
      const over = !r.ok;
      const refused = over && mode === 'enforce' && scope !== 'html';
      const retryAfter = Math.ceil(r.retryAfterMs / 1000);
      if (r.firstOver) log({ msg: 'rate_limit', mode, scope, caller: who.caller, tier: tierName, method: req.method, path: req.originalUrl, refused });
      const headers = policy.limit === Infinity ? {} : {
        'RateLimit-Policy': `"${tierName}";q=${policy.limit};w=${Math.round(policy.windowMs / 1000)}`,
        RateLimit: `"${tierName}";r=${r.remaining};t=${Math.ceil(r.resetMs / 1000)}`,
      };
      return { caller: who.caller, tier: tierName, allowed: !refused, over, refused, retryAfter, headers };
    },
  };
}
