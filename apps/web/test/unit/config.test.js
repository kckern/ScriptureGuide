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

describe('no server-side sessions', () => {
  test('config has no session block and express-session is not a dependency', async () => {
    const { config } = await import('../../src/config/index.js');
    expect(config).not.toHaveProperty('session');
    const pkg = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../../package.json', import.meta.url), 'utf8'));
    expect(pkg.dependencies).not.toHaveProperty('express-session');
  });
});
