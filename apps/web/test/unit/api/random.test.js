import { describe, test, expect, vi } from 'vitest';
import { pickRandomVerse } from '../../../src/api/v1/random.js';

describe('pickRandomVerse', () => {
  test('no version or volume: the site\'s weighted pick', async () => {
    const repo = { randomVerseId: vi.fn() };
    const id = await pickRandomVerse({ versions: [], volume: null }, { repo, random: () => 0 });
    expect(id).toBe(1);
    expect(repo.randomVerseId).not.toHaveBeenCalled();
  });
  test('a version and a volume: a verse that version has, in that volume', async () => {
    const repo = { randomVerseId: vi.fn(async () => 31200) };
    expect(await pickRandomVerse({ versions: ['LDS'], volume: 'bom' }, { repo })).toBe(31200);
    expect(repo.randomVerseId.mock.calls[0][0]).toEqual({ range: [31103, 37706], version: 'LDS' });
  });
  test('a volume only: the volume\'s default version', async () => {
    const repo = { randomVerseId: vi.fn(async () => 26000) };
    await pickRandomVerse({ versions: [], volume: 'nt' }, { repo });
    expect(repo.randomVerseId.mock.calls[0][0]).toEqual({ range: [23146, 31102], version: 'LDS' });
  });
  test('a version only: any verse that version has, in or out of the standard works', async () => {
    const repo = { randomVerseId: vi.fn(async () => 68942) };
    expect(await pickRandomVerse({ versions: ['JST'], volume: null }, { repo })).toBe(68942);
    const [min, max] = repo.randomVerseId.mock.calls[0][0].range;
    expect(min).toBe(1);
    expect(max).toBeGreaterThan(90000);
  });
  test('several versions: the pick comes from the first', async () => {
    const repo = { randomVerseId: vi.fn(async () => 26000) };
    await pickRandomVerse({ versions: ['NRSV', 'KJV'], volume: 'nt' }, { repo });
    expect(repo.randomVerseId.mock.calls[0][0].version).toBe('NRSV');
  });
  test('nothing to pick', async () => {
    const repo = { randomVerseId: async () => null };
    await expect(pickRandomVerse({ versions: ['NRSV'], volume: 'bom' }, { repo })).rejects.toMatchObject({ code: 'not_in_version', status: 404 });
  });
});
