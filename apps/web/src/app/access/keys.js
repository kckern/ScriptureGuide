// API keys: "sg_live_" + 32 base62 characters. The prefix makes leaked keys findable by secret
// scanners; only a SHA-256 hash is stored, and the first 16 characters (keyPrefix: "sg_live_" and
// 8 random characters, unique in the table) name a key in logs and the CLI.
import { createHash, randomBytes } from 'node:crypto';

export const KEY_PATTERN = /^sg_live_[A-Za-z0-9]{32}$/;
export const PREFIX_LEN = 16;
export const PREFIX_PATTERN = /^sg_live_[A-Za-z0-9]{8}$/;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function generateKey() {
  let out = '';
  while (out.length < 32) {
    for (const byte of randomBytes(48)) {
      if (byte < 248 && out.length < 32) out += ALPHABET[byte % 62]; // 248 = 4 × 62, no bias
    }
  }
  return `sg_live_${out}`;
}

export function parseBearer(header) {
  const m = /^Bearer (\S+)$/i.exec(String(header ?? '').trim());
  return m && KEY_PATTERN.test(m[1]) ? m[1] : null;
}

export const hashKey = key => createHash('sha256').update(key).digest('hex');
export const keyPrefix = key => key.slice(0, PREFIX_LEN);
