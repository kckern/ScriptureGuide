import db from '../db/connection.js';

// API keys (src/app/access/keys.js). Only a SHA-256 hash of each key is stored. Until KC creates
// the table (scripts/api-key.mjs schema), findByHash answers undefined: keys are not live yet.
export const SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS api_keys (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  prefix CHAR(12) NOT NULL,
  hash CHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  tier VARCHAR(32) NOT NULL DEFAULT 'key',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  UNIQUE KEY api_keys_hash (hash),
  KEY api_keys_prefix (prefix)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

const noTable = err => err?.code === 'ER_NO_SUCH_TABLE';

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

  async list() {
    return this.db.query('SELECT prefix, label, tier, created_at, revoked_at FROM api_keys ORDER BY created_at, id');
  }

  // db.query gives the result header for an UPDATE, so affectedRows is the count revoked
  async revoke(prefix) {
    const res = await this.db.query('UPDATE api_keys SET revoked_at = NOW() WHERE prefix = ? AND revoked_at IS NULL', [prefix]);
    return res?.affectedRows ?? 0;
  }
}

export default new ApiKeyRepository();
