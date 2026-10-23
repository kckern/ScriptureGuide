// Guard against licensed text in data/seeds. Each seed file is data/seeds/<table>.sql.gz.
// Version-scoped tables are checked for the distinct values of their version column.
import { readFileSync, readdirSync } from 'fs';
import { gunzipSync } from 'zlib';
import { fileURLToPath } from 'url';

export function findViolations(manifest, versionsByTable) {
  const out = [];
  for (const [table, versions] of Object.entries(versionsByTable)) {
    const spec = manifest.tables[table];
    if (!spec) { out.push(`${table}: not in manifest`); continue; }
    if (spec.scope === 'pairs') {
      const allowed = new Set(spec.allow.map(p => p.join('\u0000')));
      for (const p of versions) {
        if (!allowed.has(p.join('\u0000'))) out.push(`${table}: (${p.join(', ')}) is not an allowed pair`);
      }
      continue;
    }
    if (spec.scope !== 'version') continue;
    for (const v of versions) {
      if (!manifest.publicVersions.includes(v)) out.push(`${table}: ${v} is not in publicVersions`);
    }
  }
  return out;
}

// export-seed writes the version column first in every row, so the first quoted
// value of each row tuple is the version.
export function versionsInSeed(sql) {
  return [...new Set([...sql.matchAll(/(?:VALUES\n|\),\n)\('((?:[^'\\]|\\.)*)'/g)].map(m => m[1]))];
}

// For pair-scoped tables export-seed writes the two pair columns first.
export function pairsInSeed(sql) {
  const seen = new Map();
  for (const m of sql.matchAll(/(?:VALUES\n|\),\n)\('((?:[^'\\]|\\.)*)','((?:[^'\\]|\\.)*)'/g)) seen.set(`${m[1]}\u0000${m[2]}`, [m[1], m[2]]);
  return [...seen.values()];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = new URL('../../data/seeds/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));
  const found = {};
  for (const f of readdirSync(dir).filter(f => f.endsWith('.sql.gz'))) {
    const table = f.replace(/^\d+-/, '').replace(/\.sql\.gz$/, '');
    const spec = manifest.tables[table];
    const sql = () => gunzipSync(readFileSync(new URL(f, dir))).toString();
    found[table] = spec?.scope === 'version' ? versionsInSeed(sql()) : spec?.scope === 'pairs' ? pairsInSeed(sql()) : [];
  }
  const v = findViolations(manifest, found);
  if (v.length) { console.error(v.join('\n')); process.exit(1); }
  console.log(`seeds ok: ${Object.keys(found).length} tables, public versions ${manifest.publicVersions.join(', ')}`);
}
