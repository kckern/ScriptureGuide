import { describe, test, expect } from 'vitest';
import { defaultVersions, versionOrder } from '../../src/domain/rules/defaultVersions.js';

const v = list => list.map(x => x.version);

describe('defaultVersions', () => {
  test('standard works default to LDS', () => {
    expect(v(defaultVersions([], [26137]))).toEqual(['LDS']);
    expect(v(defaultVersions([], [31103, 31104]))).toEqual(['LDS']);
    expect(v(defaultVersions([], [37707]))).toEqual(['LDS']);
  });
  test('a range across volume boundaries gets no default (PHP compares min and max per range)', () => {
    expect(v(defaultVersions([], [31000, 31200]))).toEqual([]);
  });
  test('Pearl of Great Price forces LDS after any requested versions', () => {
    expect(v(defaultVersions([{ version: 'KJV', format: 'KJV' }], [41361]))).toEqual(['KJV', 'LDS']);
  });
  test('other collections', () => {
    expect(v(defaultVersions([], [42000]))).toEqual(['LEC']);
    expect(v(defaultVersions([], [50000]))).toEqual(['JST']);
    expect(v(defaultVersions([], [80000]))).toEqual(['TSP']);
    expect(v(defaultVersions([], [83000]))).toEqual(['LAW']);
    expect(v(defaultVersions([], [85000]))).toEqual(['YALI']);
    expect(v(defaultVersions([], [90000]))).toEqual(['1833']);
    expect(v(defaultVersions([], [91000]))).toEqual(['1835']);
    expect(v(defaultVersions([], [91500]))).toEqual(['GFRONSDAL', '1835']);
    expect(v(defaultVersions([], [92000]))).toEqual(['ASITIS', '1835']);
    expect(v(defaultVersions([], [92600]))).toEqual(['1835', 'MITCHELL']);
    expect(v(defaultVersions([], [93000]))).toEqual(['1835', 'ULOLD']);
  });
  test('defaults come after requested versions and do not duplicate them', () => {
    expect(v(defaultVersions([{ version: 'KJV', format: 'KJV' }], [1]))).toEqual(['KJV', 'LDS']);
    expect(v(defaultVersions([{ version: 'LDS', format: 'LDS' }], [1]))).toEqual(['LDS']);
  });
});

describe('versionOrder', () => {
  test('LDS moves last so it does not override other preferences', () => {
    expect(v(versionOrder([{ version: 'LDS', format: 'LDS' }, { version: '1830', format: '1830' }]))).toEqual(['1830', 'LDS']);
  });
});
