import { describe, test, expect } from 'vitest';
import { generateKey, parseBearer, hashKey, keyPrefix, KEY_PATTERN, PREFIX_LEN, PREFIX_PATTERN } from '../../../src/app/access/keys.js';

describe('API key format', () => {
  test('generated keys match the pattern and differ', () => {
    const a = generateKey(), b = generateKey();
    expect(a).toMatch(KEY_PATTERN);
    expect(a).toMatch(/^sg_live_[A-Za-z0-9]{32}$/);
    expect(a).not.toBe(b);
  });
  test('parseBearer reads a well-formed key and nothing else', () => {
    const k = generateKey();
    expect(parseBearer(`Bearer ${k}`)).toBe(k);
    expect(parseBearer(`bearer ${k}`)).toBe(k);
    expect(parseBearer(undefined)).toBeNull();
    expect(parseBearer('Basic abc')).toBeNull();
    expect(parseBearer('Bearer not-a-key')).toBeNull();
    expect(parseBearer(`Bearer ${k} extra`)).toBeNull();
  });
  test('hash is SHA-256 hex; prefix is the first 16 characters (8 random)', () => {
    const k = 'sg_live_' + 'a'.repeat(32);
    expect(hashKey(k)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashKey(k)).toBe(hashKey(k));
    expect(PREFIX_LEN).toBe(16);
    expect(keyPrefix(k)).toBe('sg_live_aaaaaaaa');
    expect(keyPrefix(generateKey())).toMatch(PREFIX_PATTERN);
  });
  test('PREFIX_PATTERN accepts a full prefix only', () => {
    expect(PREFIX_PATTERN.test('sg_live_abcd1234')).toBe(true);
    expect(PREFIX_PATTERN.test('sg_live_abcd')).toBe(false);
    expect(PREFIX_PATTERN.test('sg_live_abcd12345')).toBe(false);
    expect(PREFIX_PATTERN.test('sg_live_abcd-234')).toBe(false);
  });
});
