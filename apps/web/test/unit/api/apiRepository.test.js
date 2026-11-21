import { describe, test, expect, vi } from 'vitest';
import { ApiRepository } from '../../../src/data/repositories/ApiRepository.js';

describe('ApiRepository.translations', () => {
  test('keyed by lower-case id, name from title_long, queried once', async () => {
    const db = { query: vi.fn(async () => [{ id: 'NRSV', title: 'NRSV', title_long: 'New Revised Standard Version' }, { id: 'printer', title: 'Printer', title_long: null }]) };
    const repo = new ApiRepository(db);
    const map = await repo.translations();
    expect(map.get('nrsv')).toEqual({ id: 'NRSV', name: 'New Revised Standard Version' });
    expect(map.get('printer')).toEqual({ id: 'printer', name: 'Printer' });
    await repo.translations();
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});

describe('ApiRepository.randomVerseId', () => {
  test('counts the verses in range, then reads the one at a random offset', async () => {
    const db = { query: vi.fn().mockResolvedValueOnce([{ n: 10 }]).mockResolvedValueOnce([{ verse_id: 31110 }]) };
    const id = await new ApiRepository(db).randomVerseId({ range: [31103, 37706], version: 'LDS' }, () => 0.75);
    expect(id).toBe(31110);
    expect(db.query.mock.calls[1][1]).toEqual(['LDS', 31103, 37706, 7]);
  });
  test('null when the translation has no verses in range', async () => {
    const db = { query: vi.fn().mockResolvedValueOnce([{ n: 0 }]) };
    expect(await new ApiRepository(db).randomVerseId({ range: [1, 10], version: 'X' })).toBeNull();
  });
});
