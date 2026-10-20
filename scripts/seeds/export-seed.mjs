// Export public-domain seed data into data/seeds/<n>-<table>.sql.gz, driven by
// data/seeds/manifest.json. Run against a private copy of the database:
//   DATABASE_URL=mysql://user:pass@127.0.0.1:3310/sgfull node scripts/seeds/export-seed.mjs
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { gzipSync } from 'zlib';
import { fileURLToPath } from 'url';

const q = id => '`' + id + '`';

export function buildSelect(table, spec, allColumns, publicVersions) {
  let cols = spec.columns ?? allColumns;
  if (spec.scope === 'version') cols = [spec.versionColumn, ...cols.filter(c => c !== spec.versionColumn)];
  const blank = new Set(spec.blank ?? []);
  const select = cols.map(c => (blank.has(c) ? `'' AS ${q(c)}` : q(c))).join(', ');
  const where = spec.scope === 'version' ? ` WHERE ${q(spec.versionColumn)} IN (?)` : '';
  const order = spec.scope === 'version' ? ' ORDER BY 1, 2' : ' ORDER BY 1';
  return { sql: `SELECT ${select} FROM ${q(table)}${where}${order}`, params: spec.scope === 'version' ? [publicVersions] : [], cols };
}

async function main() {
  const { createConnection } = await import('mysql2/promise');
  const conn = await createConnection({ uri: process.env.DATABASE_URL, charset: 'utf8mb4' });
  const dir = new URL('../../data/seeds/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));
  for (const f of readdirSync(dir).filter(f => f.endsWith('.sql.gz'))) unlinkSync(new URL(f, dir));
  let n = 1;
  for (const [table, spec] of Object.entries(manifest.tables)) {
    const [colRows] = await conn.query(
      'SELECT column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position', [table]);
    const { sql, params, cols } = buildSelect(table, spec, colRows.map(r => r.c), manifest.publicVersions);
    const [rows] = await conn.query({ sql, values: params, rowsAsArray: true });
    const lines = ['SET NAMES utf8mb4;'];
    for (let i = 0; i < rows.length; i += 500) {
      const values = rows.slice(i, i + 500).map(r => '(' + r.map(v => conn.escape(v)).join(',') + ')').join(',\n');
      lines.push(`INSERT INTO ${q(table)} (${cols.map(q).join(',')}) VALUES\n${values};`);
    }
    // Numbered so MySQL's docker-entrypoint-initdb.d loads them after 00-schema.sql, in manifest order.
    const file = `${String(n++).padStart(2, '0')}-${table}.sql.gz`;
    writeFileSync(new URL(file, dir), gzipSync(lines.join('\n') + '\n', { level: 9 }));
    console.log(`${file}: ${rows.length} rows`);
  }
  await conn.end();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
