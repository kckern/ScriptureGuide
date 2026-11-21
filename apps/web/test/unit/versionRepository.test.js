import { describe, test, expect, vi } from 'vitest';
import { knownVersionSet } from '../../src/data/repositories/VersionRepository.js';

describe('knownVersionSet: the names a version segment may use, read once per repository', () => {
  test('reads the version list once', async () => {
    const repo = { findAll: vi.fn(async () => [{ id: 'KJV', volumes: 'ot,nt' }]) };
    const first = await knownVersionSet(repo);
    expect(first.has('KJV') && first.has('OT')).toBe(true);
    expect(await knownVersionSet(repo)).toBe(first);
    expect(repo.findAll).toHaveBeenCalledTimes(1);
  });
  test('a failed read is not kept', async () => {
    const repo = { findAll: vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce([{ id: 'LDS', volumes: '' }]) };
    await expect(knownVersionSet(repo)).rejects.toThrow('db down');
    expect((await knownVersionSet(repo)).has('LDS')).toBe(true);
  });
});

describe('knownVersionSet: kept for an hour', () => {
  test('read again after KNOWN_TTL_MS', async () => {
    const { KNOWN_TTL_MS } = await import('../../src/data/repositories/VersionRepository.js');
    expect(KNOWN_TTL_MS).toBe(60 * 60 * 1000);
    let t = 1000;
    const now = () => t;
    const repo = { findAll: vi.fn(async () => [{ id: 'KJV', volumes: '' }]) };
    await knownVersionSet(repo, now);
    t += KNOWN_TTL_MS - 1;
    await knownVersionSet(repo, now);
    expect(repo.findAll).toHaveBeenCalledTimes(1);
    t += 1;
    await knownVersionSet(repo, now);
    expect(repo.findAll).toHaveBeenCalledTimes(2);
  });
});
