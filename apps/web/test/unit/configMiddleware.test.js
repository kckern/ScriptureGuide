import { describe, test, expect } from 'vitest';
import { rawQuery } from '../../src/app/middleware/config.js';

describe('rawQuery', () => {
  test('the last q wins, as PHP kept the last value', () => {
    expect(rawQuery({ originalUrl: '/x?q=a&q=b' }).q).toBe('b');
  });
  test('other repeated keys keep their first value', () => {
    expect(rawQuery({ originalUrl: '/x?v=1&v=2&q=a' })).toEqual({ v: '1', q: 'a' });
  });
});
