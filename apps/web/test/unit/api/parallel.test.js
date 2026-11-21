import { describe, test, expect, vi } from 'vitest';
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
// ParallelService's sides as read, after the edition swap
const sides = (left, right) => ({ left: { ver: left, ref: 'x' }, right: { ver: right, ref: 'y' } });
const built = (over = {}) => ({ build: vi.fn(async () => ({ ...page, sides: sides('kjv', 'lds'), ...over })) });
const deps = {
  parallel: built(),
  repo: { versions: async () => new Map([['kjv', { id: 'KJV', name: 'King James Version', lang: 'en' }], ['lds', { id: 'LDS', name: 'LDS', lang: 'en' }], ['nrsv', { id: 'NRSV', name: 'NRSV', lang: 'en' }], ['1830', { id: '1830', name: '1830', lang: 'en' }]]) },
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
  test('an unknown version on either side, including a bare one on the left (hbrs~kjv/isa.49)', async () => {
    await expect(buildParallel('xyz/isa2~lds/2ne12', { ...deps, parallel: built({ sides: sides('xyz', 'lds') }) })).rejects.toMatchObject({ code: 'unknown_version', status: 404, message: expect.stringContaining('xyz') });
    await expect(buildParallel('kjv/isa2~xyz/2ne12', { ...deps, parallel: built({ sides: sides('kjv', 'xyz') }) })).rejects.toMatchObject({ code: 'unknown_version' });
    await expect(buildParallel('hbrs~kjv/isa.49', { ...deps, parallel: built({ lver: 'LDS', sides: sides('hbrs', 'kjv') }) })).rejects.toMatchObject({ code: 'unknown_version', message: expect.stringContaining('hbrs') });
  });
  test('a version without the verses: ParallelService fell back to the default version', async () => {
    // NRSV has no Book of Mormon, so the right side came back in LDS
    await expect(buildParallel('kjv/isa2~nrsv/2ne12', { ...deps, parallel: built({ sides: sides('kjv', 'nrsv') }) }))
      .rejects.toMatchObject({ code: 'not_in_version', status: 404, message: expect.stringContaining('NRSV') });
    // an edition on the left ("1830~kjv/john.1") is a version too
    await expect(buildParallel('1830~kjv/john.1', { ...deps, parallel: built({ lver: 'LDS', rver: 'KJV', sides: { left: { ver: '1830', ref: 'john.1' }, right: { ver: 'kjv', ref: 'john.1' } } }) }))
      .rejects.toMatchObject({ code: 'not_in_version', message: expect.stringContaining('1830 has no text for the left side, "john.1"') });
  });
  test('a side with no version asked for takes what ParallelService found', async () => {
    const data = await buildParallel('isa2~2ne12', { ...deps, parallel: built({ sides: sides('', '') }) });
    expect(data.left.version.id).toBe('KJV');
  });
  test('the stored version id in any case is the version asked for', async () => {
    const data = await buildParallel('KJV/isa2~LDS/2ne12', deps);
    expect(data.left.version.id).toBe('KJV');
  });
});
