import { describe, test, expect, vi } from 'vitest';
import { buildSearch, PER_PAGE } from '../../../src/api/v1/search.js';

const row = (id, version = 'NRSV') => ({ verse_id: id, version, ref: `Ref ${id}`, refShort: `Ref ${id}`, text: 'God so loved the world', highlighted: "God so <span class='searchterm'>loved</span> the world" });

describe('buildSearch', () => {
  test('canon order, offsets, paging', async () => {
    const rows = Array.from({ length: PER_PAGE + 5 }, (_, i) => row(30000 - i));
    const search = { search: vi.fn(async () => ({ rows, truncated: false })) };
    const data = await buildSearch({ terms: 'loved', version: 'NRSV', volume: null, page: 2 }, { search });
    expect(search.search).toHaveBeenCalledWith('loved', { forcedVersion: 'NRSV', requeryForced: true });
    expect(data).toMatchObject({ api: 'v1', query: 'loved', scope: { version: 'NRSV', volume: null }, total: PER_PAGE + 5, truncated: false, page: 2, per_page: PER_PAGE });
    expect(data.results).toHaveLength(5);
    expect(data.results[0].id).toBeLessThan(data.results[1].id);
    expect(data.results[0]).toEqual({ id: 29996, reference: 'Ref 29996', slug: 'ref.29996', version: 'NRSV', text: 'God so loved the world', highlights: [[7, 12]] });
    expect(data.links.next).toBeNull();
  });
  test('version and volume: SearchService searches the volume\'s range in that version', async () => {
    const search = { search: vi.fn(async () => ({ rows: [row(26137)], truncated: false })) };
    const data = await buildSearch({ terms: 'loved', version: 'NRSV', volume: 'nt', page: 1 }, { search });
    expect(search.search).toHaveBeenCalledWith('loved', { forcedVersion: 'NRSV', range: [23146, 31102], requeryForced: true });
    expect(data.results.map(r => r.id)).toEqual([26137]);
  });
  test('volume alone is the forced version', async () => {
    const search = { search: vi.fn(async () => ({ rows: [], truncated: false })) };
    const data = await buildSearch({ terms: 'x', version: null, volume: 'bom', page: 1 }, { search });
    expect(search.search).toHaveBeenCalledWith('x', { forcedVersion: 'bom', requeryForced: true });
    expect(data).toMatchObject({ total: 0, results: [] });
  });
  test('no scope searches every version', async () => {
    const search = { search: vi.fn(async () => ({ rows: [], truncated: false })) };
    await buildSearch({ terms: 'x', version: null, volume: null, page: 1 }, { search });
    expect(search.search).toHaveBeenCalledWith('x', { forcedVersion: null, requeryForced: true });
  });
  test('the next link', async () => {
    const search = { search: async () => ({ rows: Array.from({ length: PER_PAGE + 1 }, (_, i) => row(i + 1)), truncated: true }) };
    const data = await buildSearch({ terms: 'loved the', version: null, volume: 'nt', page: 1 }, { search });
    expect(data.links.next).toBe('https://api.scripture.guide/v1/search/nt/page-2/loved+the');
    expect(data.truncated).toBe(true);
  });
  test('a capped search is truncated', async () => {
    const search = { search: async () => ({ rows: [row(1)], truncated: false, capped: true }) };
    expect((await buildSearch({ terms: 'the', version: null, volume: null, page: 1 }, { search })).truncated).toBe(true);
  });
  test('web links use the site\'s search paths', async () => {
    const search = { search: async () => ({ rows: [], truncated: false }) };
    const web = async scope => (await buildSearch({ terms: 'loved the world', page: 1, version: null, volume: null, ...scope }, { search })).links.web;
    expect(await web({})).toBe('https://scripture.guide/search/loved.the.world');
    expect(await web({ version: 'NRSV' })).toBe('https://scripture.guide/nrsv/loved.the.world');
    expect(await web({ volume: 'bom' })).toBe('https://scripture.guide/bom/loved.the.world');
    expect(await web({ version: 'NRSV', volume: 'nt' })).toBe('https://scripture.guide/nrsv/loved.the.world');
  });
});
