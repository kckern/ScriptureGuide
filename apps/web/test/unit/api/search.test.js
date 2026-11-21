import { describe, test, expect, vi } from 'vitest';
import { buildSearch, PER_PAGE } from '../../../src/api/v1/search.js';

// A SearchService whose match() finds these rows and whose hydrate() returns them
function fake(rows, { truncated = false, capped = false } = {}) {
  return {
    match: vi.fn(async q => ({ query: q, count: rows.length, picks: rows.map(r => ({ key: r.key ?? r.verse_id, version: r.version, verse_id: r.verse_id, row: r })), truncated, capped })),
    hydrate: vi.fn(async (q, picks) => picks.map(p => p.row)),
  };
}
const row = (id, version = 'NRSV') => ({ verse_id: id, version, ref: `Ref ${id}`, refShort: `Ref ${id}`, text: 'God so loved the world', highlighted: "God so <span class='searchterm'>loved</span> the world" });

describe('buildSearch', () => {
  test('offsets and paging', async () => {
    const rows = Array.from({ length: PER_PAGE + 5 }, (_, i) => row(1000 + i));
    const search = fake(rows, { truncated: false });
    const data = await buildSearch({ terms: 'loved', version: 'NRSV', volume: null, page: 2 }, { search });
    expect(search.match).toHaveBeenCalledWith('loved', { forcedVersion: 'NRSV', requeryForced: true });
    expect(data).toMatchObject({ api: 'v1', query: 'loved', scope: { version: 'NRSV', volume: null }, total: PER_PAGE + 5, truncated: false, page: 2, per_page: PER_PAGE });
    expect(data.results).toHaveLength(5);
    expect(data.results[0]).toEqual({ id: 1050, reference: 'Ref 1050', slug: 'ref.1050', version: 'NRSV', text: 'God so loved the world', highlights: [[7, 12]] });
    expect(data.links.next).toBeNull();
    // only the page asked for is read
    expect(search.hydrate.mock.calls[0][1]).toHaveLength(5);
  });
  test('canon order is SearchService\'s: a Book of Commandments verse stays with the D&C verse it stands for', async () => {
    const boc = { ...row(89500, '1833'), key: 37800 };
    const search = fake([row(37750, 'LDS'), boc, row(38000, 'LDS')]);
    const data = await buildSearch({ terms: 'x', version: null, volume: null, page: 1 }, { search });
    expect(data.results.map(r => r.id)).toEqual([37750, 89500, 38000]);
  });
  test('version and volume: SearchService searches the volume\'s range in that version', async () => {
    const search = fake([row(26137)], { truncated: false });
    const data = await buildSearch({ terms: 'loved', version: 'NRSV', volume: 'nt', page: 1 }, { search });
    expect(search.match).toHaveBeenCalledWith('loved', { forcedVersion: 'NRSV', range: [23146, 31102], requeryForced: true });
    expect(data.results.map(r => r.id)).toEqual([26137]);
  });
  test('volume alone is the forced version', async () => {
    const search = fake([], { truncated: false });
    const data = await buildSearch({ terms: 'x', version: null, volume: 'bom', page: 1 }, { search });
    expect(search.match).toHaveBeenCalledWith('x', { forcedVersion: 'bom', requeryForced: true });
    expect(data).toMatchObject({ total: 0, results: [] });
  });
  test('no scope searches every version', async () => {
    const search = fake([], { truncated: false });
    await buildSearch({ terms: 'x', version: null, volume: null, page: 1 }, { search });
    expect(search.match).toHaveBeenCalledWith('x', { forcedVersion: null, requeryForced: true });
  });
  test('the next link', async () => {
    const search = fake(Array.from({ length: PER_PAGE + 1 }, (_, i) => row(i + 1)), { truncated: true });
    const data = await buildSearch({ terms: 'loved the', version: null, volume: 'nt', page: 1 }, { search });
    expect(data.links.next).toBe('https://api.scripture.guide/v1/search/nt/page-2/loved+the');
    expect(data.truncated).toBe(true);
  });
  test('ids: results without text and highlights; the next page keeps the option', async () => {
    const search = fake(Array.from({ length: PER_PAGE + 1 }, (_, i) => row(i + 1)));
    const data = await buildSearch({ terms: 'loved', version: 'NRSV', volume: null, page: 1, options: ['ids'] }, { search });
    expect(data.results[0]).toEqual({ id: 1, reference: 'Ref 1', slug: 'ref.1', version: 'NRSV' });
    expect(data.links.next).toBe('https://api.scripture.guide/v1/ids/search/nrsv/page-2/loved');
  });
  test('html does not change search', async () => {
    const search = fake([row(1)]);
    const data = await buildSearch({ terms: 'loved', version: null, volume: null, page: 1, options: ['html'] }, { search });
    expect(data.results[0]).toHaveProperty('highlights');
    expect(data.results[0]).not.toHaveProperty('html');
  });
  test('a capped search is truncated', async () => {
    const search = fake([row(1)], { truncated: false, capped: true });
    expect((await buildSearch({ terms: 'the', version: null, volume: null, page: 1 }, { search })).truncated).toBe(true);
  });
  test('web links use the site\'s search paths', async () => {
    const search = fake([], { truncated: false });
    const web = async scope => (await buildSearch({ terms: 'loved the world', page: 1, version: null, volume: null, ...scope }, { search })).links.web;
    expect(await web({})).toBe('https://scripture.guide/search/loved.the.world');
    expect(await web({ version: 'NRSV' })).toBe('https://scripture.guide/nrsv/loved.the.world');
    expect(await web({ volume: 'bom' })).toBe('https://scripture.guide/bom/loved.the.world');
    expect(await web({ version: 'NRSV', volume: 'nt' })).toBe('https://scripture.guide/nrsv/loved.the.world');
    // with a digit the site reads /{version}/{terms} as a reference, so the link is a plain search
    expect(await web({ version: 'NRSV', terms: '144000' })).toBe('https://scripture.guide/search/144000');
    expect(await web({ volume: 'bom', terms: '2 witnesses' })).toBe('https://scripture.guide/search/2.witnesses');
  });
});
