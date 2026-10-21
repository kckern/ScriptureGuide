import { describe, test, expect } from 'vitest';
import { intEnv } from '../../src/config/index.js';

describe('intEnv', () => {
  test('reads an integer, 0 included', () => {
    expect(intEnv('7', 3)).toBe(7);
    expect(intEnv('0', 3)).toBe(0);
  });
  test('unset or not a number: the default', () => {
    expect(intEnv(undefined, 3)).toBe(3);
    expect(intEnv('', 3)).toBe(3);
    expect(intEnv('abc', 3)).toBe(3);
  });
});
