import { describe, test, expect, vi } from 'vitest';
import { ApiKeyRepository, SCHEMA_SQL } from '../../../src/data/repositories/ApiKeyRepository.js';
import { KEY_PATTERN, hashKey, keyPrefix } from '../../../src/app/access/keys.js';

const dup = () => Object.assign(new Error("Duplicate entry 'x' for key 'api_keys_prefix'"), { code: 'ER_DUP_ENTRY' });
const missing = Object.assign(new Error("Table 'x.api_keys' doesn't exist"), { code: 'ER_NO_SUCH_TABLE' });

describe('ApiKeyRepository', () => {
  test('findByHash: a live key gives its row', async () => {
    const db = { query: vi.fn(async () => [{ prefix: 'sg_live_abcd', label: 'KC', tier: 'key', revoked_at: null }]) };
    expect(await new ApiKeyRepository(db).findByHash('h')).toMatchObject({ prefix: 'sg_live_abcd', tier: 'key' });
    expect(db.query.mock.calls[0][0]).toMatch(/revoked_at IS NULL/);
  });
  test('findByHash: no row gives null', async () => {
    expect(await new ApiKeyRepository({ query: async () => [] }).findByHash('h')).toBeNull();
  });
  test('findByHash: no table yet gives undefined (keys not live)', async () => {
    const repo = new ApiKeyRepository({ query: async () => { throw missing; } });
    expect(await repo.findByHash('h')).toBeUndefined();
  });
  test('other database errors are thrown', async () => {
    const repo = new ApiKeyRepository({ query: async () => { throw Object.assign(new Error('down'), { code: 'ECONNREFUSED' }); } });
    await expect(repo.findByHash('h')).rejects.toThrow('down');
  });
  test('the schema names every column the code uses', () => {
    for (const col of ['prefix', 'hash', 'label', 'tier', 'created_at', 'revoked_at']) expect(SCHEMA_SQL).toContain(col);
  });
  test('the prefix is 16 characters and unique', () => {
    expect(SCHEMA_SQL).toMatch(/prefix CHAR\(16\)/);
    expect(SCHEMA_SQL).toMatch(/UNIQUE KEY api_keys_prefix \(prefix\)/);
  });
  test('issue stores the prefix and hash of a new key and returns the key', async () => {
    const db = { query: vi.fn(async () => ({ affectedRows: 1 })) };
    const key = await new ApiKeyRepository(db).issue({ label: 'KC', tier: 'key' });
    expect(key).toMatch(KEY_PATTERN);
    expect(db.query.mock.calls[0][1]).toEqual([keyPrefix(key), hashKey(key), 'KC', 'key']);
  });
  test('issue tries a fresh key when the prefix is taken', async () => {
    const db = { query: vi.fn().mockRejectedValueOnce(dup()).mockResolvedValue({ affectedRows: 1 }) };
    const key = await new ApiKeyRepository(db).issue({ label: 'KC', tier: 'key' });
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query.mock.calls[1][1][0]).toBe(keyPrefix(key));
    expect(db.query.mock.calls[0][1][0]).not.toBe(db.query.mock.calls[1][1][0]);
  });
  test('issue gives up after 3 retries, and throws other errors at once', async () => {
    const always = { query: vi.fn(async () => { throw dup(); }) };
    await expect(new ApiKeyRepository(always).issue({ label: 'KC', tier: 'key' })).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    expect(always.query).toHaveBeenCalledTimes(4);
    const down = { query: vi.fn(async () => { throw Object.assign(new Error('down'), { code: 'ECONNREFUSED' }); }) };
    await expect(new ApiKeyRepository(down).issue({ label: 'KC', tier: 'key' })).rejects.toThrow('down');
    expect(down.query).toHaveBeenCalledTimes(1);
  });
  test('revoke takes a full prefix only', async () => {
    const db = { query: vi.fn(async () => ({ affectedRows: 1 })) };
    const repo = new ApiKeyRepository(db);
    await expect(repo.revoke('sg_live_ab')).rejects.toThrow(/prefix/);
    await expect(repo.revoke(undefined)).rejects.toThrow(/prefix/);
    expect(db.query).not.toHaveBeenCalled();
    expect(await repo.revoke('sg_live_abcd1234')).toBe(1);
    expect(db.query.mock.calls[0][1]).toEqual(['sg_live_abcd1234']);
  });
});
