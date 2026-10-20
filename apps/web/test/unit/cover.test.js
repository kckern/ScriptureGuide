import { describe, it, expect } from 'vitest';
import { versionIMG, coverUrl } from '../../src/presentation/coverImage.js';
import { CoverPresenter, coverRequest, coverName } from '../../src/presentation/presenters/formats/cover.js';

function fakeRes() {
  const res = { redirected: null, redirect(status, url) { res.redirected = [status, url]; return res; } };
  return res;
}

describe('versionIMG', () => {
  it('picks the LDS cover by volume and lowercases other versions', () => {
    expect(versionIMG('LDS', 1)).toBe('ldskjv');
    expect(versionIMG('LDS', 2)).toBe('ldskjv');
    expect(versionIMG('LDS', 3)).toBe('lds-bom2');
    expect(versionIMG('LDS', 4)).toBe('lds-dc2');
    expect(versionIMG('LDS', 5)).toBe('lds-pgp2');
    expect(versionIMG('LDS', null)).toBe('lds-bom2');
    expect(versionIMG('KJV*MEV', 1)).toBe('kjv');
    expect(coverUrl('kjv')).toBe('https://media.scripture.guide/covers/kjv.jpg');
  });
});

describe('cover', () => {
  const repo = { volumeIdOf: async ids => (ids[0] < 23146 ? 1 : ids[0] < 31103 ? 2 : 3) };

  it('redirects a reference to its version cover', async () => {
    const res = fakeRes();
    await new CoverPresenter(repo).present({ reference: { verseIds: [26137] }, config: { version: 'LDS' } }, { path: '/john.3.16' }, res);
    expect(res.redirected).toEqual([302, 'https://media.scripture.guide/covers/ldskjv.jpg']);
    await new CoverPresenter(repo).present({ reference: { verseIds: [26137] }, config: { version: 'kjv' } }, { path: '/kjv/john.3.16' }, res);
    expect(res.redirected).toEqual([302, 'https://media.scripture.guide/covers/kjv.jpg']);
  });

  it('redirects a cover name, with or without extension', () => {
    const res = fakeRes();
    let passed = false;
    coverRequest({ method: 'GET', path: '/ldskjv.jpg' }, res, () => { passed = true; });
    expect(res.redirected).toEqual([302, 'https://media.scripture.guide/covers/ldskjv.jpg']);
    coverRequest({ method: 'GET', path: '/john.3.16' }, res, () => { passed = true; });
    expect(passed).toBe(true);
    expect(coverName('/KJV*MEV.png')).toBe('kjv');
  });

  it('falls back to the path name when the reference does not resolve', async () => {
    const res = fakeRes();
    await new CoverPresenter(repo).present({ reference: { verseIds: [] }, config: {} }, { path: '/lds-bom2' }, res);
    expect(res.redirected).toEqual([302, 'https://media.scripture.guide/covers/lds-bom2.jpg']);
  });
});
