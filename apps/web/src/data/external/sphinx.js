// SphinxQL client: Sphinx speaks the MySQL wire protocol on port 9306 (listen = 9306:mysql41),
// so mysql2 connects to it directly. The PHP site shells out to `mysql -hsphinx -P9306` with the
// same statements (scriptures::search).
import mysql from 'mysql2/promise';

// The PHP site interpolates the query as-is, so Sphinx operators (-, |, "…", *) work on the live
// site. Keep that, and only escape what would end the SQL string literal.
export function escapeMatch(text) {
  return String(text).replace(/[\\']/g, ch => `\\${ch}`);
}

const quoteList = list => list.map(v => `'${String(v).replace(/['\\]/g, '')}'`).join(',');

/**
 * SELECT verse_id,version FROM sgindex WHERE MATCH('@(text) <q>') AND version IN (...)
 *   [AND verse_id BETWEEN a AND b] LIMIT n [OPTION max_matches=m]
 */
export function buildSearchSql(query, { versions = [], range = null, limit = 99999, maxMatches = null } = {}) {
  let sql = `SELECT verse_id, version FROM sgindex WHERE MATCH('@(text) ${escapeMatch(query)}')`;
  if (versions.length) sql += ` AND version IN (${quoteList(versions)})`;
  if (range) sql += ` AND verse_id BETWEEN ${Number(range[0])} AND ${Number(range[1])}`;
  sql += ` LIMIT ${Number(limit)}`;
  // Production sends no OPTION max_matches, so searchd's default cap (1000) applies there too;
  // the Sphinx/fallback comparison raises it to read every hit.
  if (maxMatches) sql += ` OPTION max_matches=${Number(maxMatches)}`;
  return sql;
}

export class SphinxClient {
  /**
   * @param {{host:string, port?:number, index?:string}} opts
   * @param {(cfg:object) => Promise<{query:Function, end:Function}>} [connect] injectable for tests
   */
  constructor({ host, port = 9306 } = {}, connect = cfg => mysql.createConnection(cfg)) {
    this.host = host;
    this.port = port;
    this.connect = connect;
    this.conn = null;
  }

  async connection() {
    if (!this.conn) {
      this.conn = this.connect({ host: this.host, port: this.port, user: '', password: '' })
        .catch(err => { this.conn = null; throw err; });
    }
    return this.conn;
  }

  async query(sql, retry = true) {
    const conn = await this.connection();
    try {
      const [rows] = await conn.query(sql);
      return rows;
    } catch (err) {
      // A dropped connection is replaced on the next call
      if (this.conn && (await this.conn.catch(() => null)) === conn) this.conn = null;
      try { await conn.end(); } catch { /* already closed */ }
      // mysql2 marks socket-level failures fatal (searchd restart, idle timeout). Searches are
      // read-only, so retry once on a fresh connection instead of failing the request.
      if (retry && err.fatal) return this.query(sql, false);
      throw err;
    }
  }

  async search(query, opts) {
    const rows = await this.query(buildSearchSql(query, opts));
    return rows.map(r => ({ verse_id: Number(r.verse_id), version: String(r.version) }));
  }

  async close() {
    if (!this.conn) return;
    const conn = await this.conn.catch(() => null);
    this.conn = null;
    if (conn) await conn.end();
  }
}

// null when SPHINX_HOST is unset: callers fall back to the MySQL search.
export function createSphinxClient(cfg) {
  if (!cfg?.host) return null;
  return new SphinxClient({ host: cfg.host, port: cfg.port });
}
