import { describe, test, expect, vi } from 'vitest';
import { ApiKeyRepository, SCHEMA_SQL } from '../../../src/data/repositories/ApiKeyRepository.js';

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
});
