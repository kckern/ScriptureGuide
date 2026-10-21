import { describe, test, expect } from 'vitest';
import { phpJson, isPhpNumeric } from '../../src/presentation/legacy/phpJson.js';

describe('phpJson (json_encode with JSON_PRETTY_PRINT)', () => {
  test('indents with four spaces like PHP', () => {
    expect(phpJson({ a: [1, 2], b: {} , c: [] })).toBe('{\n    "a": [\n        1,\n        2\n    ],\n    "b": {},\n    "c": []\n}');
  });

  test('escapes slashes and non-ASCII characters', () => {
    expect(phpJson('</h3>')).toBe('"<\\/h3>"');
    expect(phpJson('¶In the beginning—')).toBe('"\\u00b6In the beginning\\u2014"');
  });

  test('escapes astral characters as surrogate pairs', () => {
    expect(phpJson('\u{1F600}')).toBe('"\\ud83d\\ude00"');
  });

  test('null and top-level strings', () => {
    expect(phpJson(null)).toBe('null');
    expect(phpJson(undefined)).toBe('null');
  });

  test('numericCheck turns numeric strings into numbers, but not keys', () => {
    const out = phpJson({ versions: { 1830: '1830' }, verse: '16', text: 'John 3:16', f: '1.5' }, { numericCheck: true });
    expect(out).toBe('{\n    "versions": {\n        "1830": 1830\n    },\n    "verse": 16,\n    "text": "John 3:16",\n    "f": 1.5\n}');
  });

  test('a Map is an object in insertion order, integer-like keys included (PHP arrays keep it)', () => {
    const versions = new Map([['2', '2'], ['0', '0']]);
    expect(phpJson({ versions }, { numericCheck: true })).toBe('{\n    "versions": {\n        "2": 2,\n        "0": 0\n    }\n}');
    expect(phpJson(new Map())).toBe('{}');
    expect(phpJson([new Map([['b', 'x/y'], ['a', null]])])).toBe('[\n    {\n        "b": "x\\/y",\n        "a": null\n    }\n]');
  });

  test('without numericCheck numeric strings stay strings', () => {
    expect(phpJson({ verse_id: '1' })).toBe('{\n    "verse_id": "1"\n}');
  });
});

describe('isPhpNumeric', () => {
  test.each([
    ['1', true], ['26137', true], ['-3', true], ['1.5', true], ['.5', true], ['1e3', true], [' 12', true],
    ['', false], ['abc', false], ['1a', false], ['0x1A', false], ['LDS', false], ['.', false],
  ])('%j → %s', (s, expected) => {
    expect(isPhpNumeric(s)).toBe(expected);
  });
});
