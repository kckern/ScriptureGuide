import db from '../db/connection.js';
import { generateKey, hashKey, keyPrefix, PREFIX_PATTERN } from '../../app/access/keys.js';

// API keys (src/app/access/keys.js). Only a SHA-256 hash of each key is stored. Until KC creates
// the table (scripts/api-key.mjs schema), findByHash answers undefined: keys are not live yet.
export const SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS api_keys (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  prefix CHAR(16) NOT NULL,
  hash CHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  tier VARCHAR(32) NOT NULL DEFAULT 'key',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  UNIQUE KEY api_keys_hash (hash),
  UNIQUE KEY api_keys_prefix (prefix)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

const noTable = err => err?.code === 'ER_NO_SUCH_TABLE';
const duplicate = err => err?.code === 'ER_DUP_ENTRY';
const ISSUE_RETRIES = 3;

export class ApiKeyRepository {
  constructor(database = db) { this.db = database; }

  // → row | null (unknown or revoked) | undefined (no table yet)
  async findByHash(hash) {
    try {
      const [row] = await this.db.query(
        'SELECT prefix, label, tier, revoked_at FROM api_keys WHERE hash = ? AND revoked_at IS NULL LIMIT 1', [hash]);
      return row ?? null;
    } catch (err) {
      if (noTable(err)) return undefined;
      throw err;
    }
  }

  async insert({ prefix, hash, label, tier }) {
    await this.db.query('INSERT INTO api_keys (prefix, hash, label, tier) VALUES (?, ?, ?, ?)', [prefix, hash, label, tier]);
  }

  // A new key, stored; → the key (the only time it exists in full). A taken prefix gets a fresh key.
  async issue({ label, tier }) {
    for (let attempt = 0; ; attempt++) {
      const key = generateKey();
      try {
        await this.insert({ prefix: keyPrefix(key), hash: hashKey(key), label, tier });
        return key;
      } catch (err) {
        if (!duplicate(err) || attempt >= ISSUE_RETRIES) throw err;
      }
    }
  }

  async list() {
    return this.db.query('SELECT prefix, label, tier, created_at, revoked_at FROM api_keys ORDER BY created_at, id');
  }

  // db.query gives the result header for an UPDATE, so affectedRows is the count revoked
  async revoke(prefix) {
    if (!PREFIX_PATTERN.test(String(prefix ?? ''))) throw new Error(`not a key prefix: ${prefix} (want sg_live_ and 8 characters, see list)`);
    const res = await this.db.query('UPDATE api_keys SET revoked_at = NOW() WHERE prefix = ? AND revoked_at IS NULL', [prefix]);
    return res?.affectedRows ?? 0;
  }
}

export default new ApiKeyRepository();
