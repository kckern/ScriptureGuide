import { loadFixtures, getTestCases, loadProseSample } from './fixture-loader.js';

describe('fixture-loader', () => {
  test('loadFixtures returns empty array when no fixtures exist', () => {
    const result = loadFixtures('nonexistent');
    expect(result).toEqual([]);
  });

  test('getTestCases returns empty array for missing function', () => {
    const fixtures = [{ language: 'en', lookup: { critical: [] } }];
    const result = getTestCases(fixtures, 'nonexistent', 'critical');
    expect(result).toEqual([]);
  });

  test('loadProseSample reads existing prose file', () => {
    const content = loadProseSample('en', 'vvtest-en.txt');
    expect(content).toContain('Alma');
  });
});
