import { describe, test, expect } from 'vitest';
import { buildParallel } from '../../../src/api/v1/parallel.js';

const page = {
  lver: 'KJV', rver: 'LDS', leftheader: 'Isaiah 2', rightheader: '2 Nephi 12', fullslug: 'kjv/isa.2~lds/2.ne.12',
  rows: [
    { className: 'diffrow sig quote', left: { verseId: 17687, ref: 'Isa. 2:1', text: ' The word  that Isaiah' }, right: { verseId: 32018, ref: '2 Ne. 12:1', text: ' The word that Isaiah' } },
    { className: 'diffrow  sidebyside', left: { verseId: '', ref: '', text: '' }, right: { verseId: 32019, ref: '2 Ne. 12:2', text: ' And it shall' } },
    { className: 'diffrow sig allusion', left: { verseId: 17689, ref: 'Isa. 2:3', text: ' a' }, right: { verseId: 32020, ref: '2 Ne. 12:3', text: ' b' } },
    { className: 'diffrow  greyout', left: { verseId: 17690, ref: 'Isa. 2:4', text: ' c' }, right: { verseId: '', ref: '', text: '' } },
  ],
};
const deps = {
  parallel: { build: async () => page },
  repo: { versions: async () => new Map([['kjv', { id: 'KJV', name: 'King James Version', lang: 'en' }], ['lds', { id: 'LDS', name: 'LDS', lang: 'en' }]]) },
};

describe('buildParallel', () => {
  test('sides and rows', async () => {
    const data = await buildParallel('kjv/isa2~lds/2ne12', deps);
    expect(data).toMatchObject({ api: 'v1', query: 'kjv/isa2~lds/2ne12' });
    expect(data.left).toEqual({ version: { id: 'KJV', name: 'King James Version', language: 'en', copyright: null }, reference: 'Isaiah 2' });
    expect(data.right.reference).toBe('2 Nephi 12');
    expect(data.rows[0]).toEqual({
      match: 'quote', significant: true,
      left: { verse_id: 17687, reference: 'Isa. 2:1', text: 'The word that Isaiah' },
      right: { verse_id: 32018, reference: '2 Ne. 12:1', text: 'The word that Isaiah' },
    });
    expect(data.rows[1]).toMatchObject({ match: 'none', significant: false, left: null });
    expect(data.links.web).toBe('https://scripture.guide/kjv/isa.2~lds/2.ne.12');
  });
  test('allusion, and a grey row is no match', async () => {
    const data = await buildParallel('kjv/isa2~lds/2ne12', deps);
    expect(data.rows[2]).toMatchObject({ match: 'allusion', significant: true });
    expect(data.rows[3]).toMatchObject({ match: 'none', significant: false, right: null });
  });
  test('nothing to compare', async () => {
    await expect(buildParallel('x~y', { ...deps, parallel: { build: async () => null } })).rejects.toMatchObject({ code: 'unparseable_reference' });
    await expect(buildParallel('x~y', { ...deps, parallel: { build: async () => ({ ...page, rows: [] }) } })).rejects.toMatchObject({ code: 'unparseable_reference' });
  });
  test('a side with no verses', async () => {
    const oneSided = { ...page, rver: '', rightheader: '', fullslug: 'kjv/john.3.16~' };
    await expect(buildParallel('kjv/john.3.16~jst.john.3.16', { ...deps, parallel: { build: async () => oneSided } }))
      .rejects.toMatchObject({ code: 'unparseable_reference', message: expect.stringContaining('"jst.john.3.16"') });
  });
});
