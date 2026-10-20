import { deepMerge } from '../../src/lib/deep-merge.mjs';

describe('deepMerge', () => {
  test('merges flat objects', () => {
    const a = { x: 1, y: 2 };
    const b = { y: 3, z: 4 };
    expect(deepMerge(a, b)).toEqual({ x: 1, y: 3, z: 4 });
  });

  test('merges nested objects', () => {
    const a = { outer: { inner: 1, keep: 2 } };
    const b = { outer: { inner: 3 } };
    expect(deepMerge(a, b)).toEqual({ outer: { inner: 3, keep: 2 } });
  });

  test('arrays are replaced, not merged', () => {
    const a = { items: [1, 2, 3] };
    const b = { items: [4, 5] };
    expect(deepMerge(a, b)).toEqual({ items: [4, 5] });
  });

  test('handles null and undefined', () => {
    const a = { x: 1 };
    expect(deepMerge(a, null)).toEqual({ x: 1 });
    expect(deepMerge(null, a)).toEqual({ x: 1 });
    expect(deepMerge(a, undefined)).toEqual({ x: 1 });
  });

  test('merges multiple objects left to right', () => {
    const a = { x: 1 };
    const b = { y: 2 };
    const c = { x: 3, z: 4 };
    expect(deepMerge(a, b, c)).toEqual({ x: 3, y: 2, z: 4 });
  });

  test('does not mutate original objects', () => {
    const a = { x: 1, nested: { y: 2 } };
    const b = { x: 2, nested: { z: 3 } };
    const result = deepMerge(a, b);
    expect(a).toEqual({ x: 1, nested: { y: 2 } });
    expect(b).toEqual({ x: 2, nested: { z: 3 } });
  });
});
