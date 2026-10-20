import { loadYaml, yamlExists } from '../../src/lib/yaml-loader.mjs';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const TEST_DIR = 'test/fixtures/_yaml-test';

describe('YAML Loader', () => {
  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(join(TEST_DIR, 'simple.yml'), 'name: test\nvalue: 42');
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  test('loadYaml parses YAML file', () => {
    const result = loadYaml(join(TEST_DIR, 'simple.yml'));
    expect(result).toEqual({ name: 'test', value: 42 });
  });

  test('loadYaml returns null for missing file', () => {
    const result = loadYaml(join(TEST_DIR, 'nonexistent.yml'));
    expect(result).toBeNull();
  });

  test('yamlExists returns true for existing file', () => {
    expect(yamlExists(join(TEST_DIR, 'simple.yml'))).toBe(true);
  });

  test('yamlExists returns false for missing file', () => {
    expect(yamlExists(join(TEST_DIR, 'nonexistent.yml'))).toBe(false);
  });
});
