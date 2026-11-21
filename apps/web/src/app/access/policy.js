// Rate-limit tiers. Placeholders until about a week of observe logs is in; then set the real
// numbers and switch API_ACCESS_MODE to enforce.
// anonymous: no key (counted per visitor IP); key: a valid API key; internal: no limit;
// html: website pages (the app only observes them; Cloudflare rate-limits pages at the edge).
const MINUTE = 60_000;
export const TIERS = Object.freeze({
  anonymous: { limit: 60, windowMs: MINUTE },
  key: { limit: 600, windowMs: MINUTE },
  internal: { limit: Infinity, windowMs: MINUTE },
  html: { limit: 120, windowMs: MINUTE },
});
export const MODES = Object.freeze(['off', 'observe', 'enforce']);
// The tiers an API key can have (scripts/api-key.mjs issues only these; a stored key with any
// other tier is treated as unknown).
export const KEY_TIERS = Object.freeze(['key', 'internal']);
