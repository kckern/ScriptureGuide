import { describe, test, expect } from 'vitest';
import { knownVersions, unknownVersions, versionNote, shownVersions } from '../../src/domain/rules/versionNotice.js';
import { parseVersionSpec } from '../../src/domain/rules/requestParsing.js';

// scripture_versions rows: id and the volume words of each version
const rows = [
  { id: 'LDS', volumes: 'bom,dc,ot,nt.pgp' }, { id: 'KJV', volumes: 'ot,nt' }, { id: '1830', volumes: 'bom' },
  { id: 'REBOM', volumes: 'bom' }, { id: 'MEV', volumes: 'ot,nt' }, { id: 'EASWARAN', volumes: 'dp,dham,dhpd,gita,gt,bg' },
  { id: 'printer', volumes: 'bom' }, { id: 'LAW', volumes: '' },
];
const known = knownVersions(rows);
const unknown = spec => unknownVersions(parseVersionSpec(spec), known);

describe('unknownVersions: the pieces of a version segment the site does not understand', () => {
  test('a version id is known, in any case', () => {
    expect(unknown('kjv.1830*rebom')).toEqual([]);
    expect(unknown('lds*rebom')).toEqual([]);
    expect(unknown('easwaran')).toEqual([]);
    expect(unknown('PRINTER')).toEqual([]);
  });
  test('a volume word (of a version, or one search reads) is known', () => {
    for (const spec of ['bom', 'BoM', 'bm', 'dc', 'ot', 'nt', 'pgp', 'gita', 'bible', 'quran', 'koran', 'boc', 'sbom', 'lec']) {
      expect(unknown(spec)).toEqual([]);
    }
  });
  test('an edition year the parallel page reads is known, with or without a version row', () => {
    expect(unknown('1853')).toEqual([]);
    expect(unknown('1981')).toEqual([]);
  });
  test('a "FLAT" format piece is known', () => {
    expect(unknown('kjv*flat')).toEqual([]);
  });
  test('anything else is not', () => {
    expect(unknown('hbrs')).toEqual(['HBRS']);
    expect(unknown('hbrs*mev')).toEqual(['HBRS']);
    expect(unknown('kjv.zzz.hbrs')).toEqual(['ZZZ', 'HBRS']);
  });
});

describe('versionNote', () => {
  test('names the version and what is shown', () => {
    expect(versionNote(['HBRS'], ['LDS'])).toBe('There is no version "HBRS". Showing LDS.');
  });
  test('several of each', () => {
    expect(versionNote(['ZZZ', 'HBRS'], ['KJV', 'LDS'])).toBe('There is no version "ZZZ" or "HBRS". Showing KJV and LDS.');
  });
  test('nothing shown: the first sentence only', () => {
    expect(versionNote(['HBRS'], [])).toBe('There is no version "HBRS".');
  });
  test('no unknown version: null', () => {
    expect(versionNote([], ['LDS'])).toBeNull();
  });
});

describe('shownVersions', () => {
  const result = (version, verses = 1) => ({ verses: Array(verses).fill({}), config: { version } });
  test('the version of a passage with verses', () => {
    expect(shownVersions(result('LDS'))).toEqual(['LDS']);
    expect(shownVersions(result('LDS', 0))).toEqual([]);
    expect(shownVersions(result('INDEX'))).toEqual([]);
  });
  test('each section\'s, once, in order', () => {
    expect(shownVersions({ ...result('LDS'), sections: [result('KJV'), result('LDS'), result('KJV'), result('JST', 0)] })).toEqual(['KJV', 'LDS']);
  });
});
