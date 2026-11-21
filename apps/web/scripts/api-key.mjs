#!/usr/bin/env node
// API keys for scripture.guide. Uses the app's MySQL settings (MYSQL_* env, src/config).
//   node scripts/api-key.mjs schema                 print the CREATE TABLE to run in Adminer
//   node scripts/api-key.mjs issue "<label>" [tier] print a new key once (default tier: key)
//   node scripts/api-key.mjs list
//   node scripts/api-key.mjs revoke <prefix>
import { generateKey, hashKey, keyPrefix } from '../src/app/access/keys.js';
import { TIERS } from '../src/app/access/policy.js';

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'schema') {
  const { SCHEMA_SQL } = await import('../src/data/repositories/ApiKeyRepository.js');
  console.log(SCHEMA_SQL + ';');
  process.exit(0);
}
const { default: repo } = await import('../src/data/repositories/ApiKeyRepository.js');
const { closePool } = await import('../src/data/db/connection.js');
try {
  if (cmd === 'issue') {
    const [label, tier = 'key'] = args;
    if (!label) throw new Error('issue needs a label');
    if (!TIERS[tier]) throw new Error(`unknown tier ${tier}; one of ${Object.keys(TIERS).join(', ')}`);
    const key = generateKey();
    await repo.insert({ prefix: keyPrefix(key), hash: hashKey(key), label, tier });
    console.log(key);
    console.error(`Issued ${keyPrefix(key)} (${tier}) for ${label}. This is the only time the key is shown.`);
  } else if (cmd === 'list') {
    for (const r of await repo.list()) console.log([r.prefix, r.tier, r.label, r.created_at?.toISOString?.() ?? r.created_at, r.revoked_at ? 'revoked' : 'live'].join('\t'));
  } else if (cmd === 'revoke') {
    if (!args[0]) throw new Error('revoke needs a key prefix (see list)');
    const n = await repo.revoke(args[0]);
    console.log(n ? `Revoked ${args[0]}` : `No live key with prefix ${args[0]}`);
  } else {
    console.error('usage: api-key.mjs schema | issue "<label>" [tier] | list | revoke <prefix>');
    process.exitCode = 2;
  }
} catch (err) {
  console.error(`api-key: ${err?.message || err?.code || err}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
