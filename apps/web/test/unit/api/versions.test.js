import { describe, test, expect } from 'vitest';
import { buildVersions } from '../../../src/api/v1/versions.js';

// The shape of ApiRepository.versions(), in priority order; Korean is stored as "kr"
const repo = {
  versions: async () => new Map([
    ['hibom', { id: 'HIBOM', name: 'Hindi Book of Mormon', lang: 'hi' }],
    ['nrsv', { id: 'NRSV', name: 'New Revised Standard Version', lang: 'en' }],
    ['krseb', { id: 'KRSEB', name: 'Korean Study Edition', lang: 'kr' }],
  ]),
};

describe('buildVersions', () => {
  test('every version in repository order, as version objects', async () => {
    expect(await buildVersions({ repo })).toEqual({
      api: 'v1',
      versions: [
        { id: 'HIBOM', name: 'Hindi Book of Mormon', language: 'hi', copyright: null },
        { id: 'NRSV', name: 'New Revised Standard Version', language: 'en', copyright: null },
        { id: 'KRSEB', name: 'Korean Study Edition', language: 'ko', copyright: null },
      ],
    });
  });
});
