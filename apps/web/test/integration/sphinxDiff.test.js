import { describe, test, expect } from 'vitest';
import { diffSets, hasDifference, isPhrase, diagnose, snippet, stemmedWords, formatQuery, shownPairs, firstPass } from './sphinxDiff.mjs';

const h = (version, ...ids) => ids.map(verse_id => ({ verse_id, version }));

describe('diffSets', () => {
  test('same sets per version, in any order and with duplicates', () => {
    const d = diffSets([...h('KJV', 1, 2), ...h('ASV', 3)], [...h('ASV', 3), ...h('KJV', 2, 1, 1)], ['KJV', 'ASV', 'WEB']);
    expect([...d.keys()]).toEqual(['KJV', 'ASV', 'WEB']);
    expect(d.get('KJV')).toEqual({ a: 2, b: 2, onlyA: [], onlyB: [] });
    expect(d.get('WEB')).toEqual({ a: 0, b: 0, onlyA: [], onlyB: [] });
    expect(hasDifference(d)).toBe(false);
  });

  test('ids only on one side, sorted, per version', () => {
    const d = diffSets([...h('KJV', 5, 1, 2), ...h('WEB', 9)], [...h('KJV', 2, 7), ...h('WEB', 9, 4)], ['KJV', 'WEB']);
    expect(d.get('KJV')).toEqual({ a: 3, b: 2, onlyA: [1, 5], onlyB: [7] });
    expect(d.get('WEB')).toEqual({ a: 1, b: 2, onlyA: [], onlyB: [4] });
    expect(hasDifference(d)).toBe(true);
  });

  test('the same verse id in another version is a different hit', () => {
    const d = diffSets(h('KJV', 1), h('ASV', 1), ['KJV', 'ASV']);
    expect(d.get('KJV').onlyA).toEqual([1]);
    expect(d.get('ASV').onlyB).toEqual([1]);
  });

  test('versions compare without regard to case; unlisted versions are kept', () => {
    const d = diffSets(h('kjv', 1), [...h('KJV', 1), ...h('LDS', 8)], ['KJV']);
    expect(d.get('KJV').onlyA).toEqual([]);
    expect(d.get('LDS')).toEqual({ a: 0, b: 1, onlyA: [], onlyB: [8] });
  });
});

describe('isPhrase', () => {
  test('quoted queries', () => {
    expect(isPhrase('"in the beginning"')).toBe(true);
    expect(isPhrase('in the beginning')).toBe(false);
    expect(isPhrase(' "faith hope" "charity" ')).toBe(true);
    expect(isPhrase('"the third day')).toBe(true);
  });
  test('a query with words outside the quotes is not a phrase query', () => {
    expect(isPhrase('"faith hope" charity')).toBe(false);
    expect(isPhrase('charity "faith hope"')).toBe(false);
  });
});

describe('diagnose', () => {
  test('only Sphinx and the matcher accepts it: the SQL prefilter dropped it', () => {
    expect(diagnose('Jesus loved Martha', 'loving', 'sphinx')).toMatch(/prefilter/);
  });
  test('only Sphinx and the matcher rejects it: tokenizer or stemmer', () => {
    expect(diagnose('He went up', 'loving', 'sphinx')).toMatch(/tokenizer\/stemmer/);
  });
  test('only fallback', () => {
    expect(diagnose('God is love', 'loved', 'fallback')).toMatch(/Sphinx does not/);
  });
  test('missing text', () => {
    expect(diagnose(undefined, 'love', 'sphinx')).toMatch(/no text/);
  });
});

describe('stemmedWords and snippet', () => {
  test('words that could carry a query stem, with their stems', () => {
    expect(stemmedWords('Beloved, let us love one another; lovers of days', 'loving days')).toBe('love, lovers→lover, days→day');
  });
  test('short text is shown whole', () => {
    expect(snippet('Jesus wept.', 'wept')).toBe('Jesus wept.');
  });
  test('long text is cut around the first query word', () => {
    const text = `${'a '.repeat(100)}charity never faileth ${'b '.repeat(100)}`;
    const s = snippet(text, 'charity', 60);
    expect(s).toContain('charity never faileth');
    expect(s.startsWith('…')).toBe(true);
    expect(s.endsWith('…')).toBe(true);
  });
});

describe('formatQuery', () => {
  test('counts per version, then each differing id with diagnosis, words and text', () => {
    const diff = diffSets(h('KJV', 1, 2), h('KJV', 2, 3), ['KJV', 'ASV']);
    const texts = new Map([['KJV|1', 'We love him, because he first loved us.'], ['KJV|3', 'Lovely things']]);
    const out = formatQuery({ query: 'loved', diff, texts, notes: ['KJV: a note'] }).join('\n');
    expect(out).toContain('DIFF  "loved"');
    expect(out).toMatch(/KJV {3}sphinx +2 {2}fallback +2 {2}only sphinx 1, only fallback 1/);
    expect(out).toMatch(/ASV {3}sphinx +0 {2}fallback +0$/m);
    expect(out).toContain('only sphinx   KJV 1: matcher accepts it: SQL prefilter missed it');
    expect(out).toContain('words: love, loved→love');
    expect(out).toContain('text:  We love him, because he first loved us.');
    expect(out).toContain('only fallback KJV 3:');
    expect(out).toContain('note: KJV: a note');
  });

  test('caps the ids shown per side', () => {
    const diff = diffSets(h('KJV', ...Array.from({ length: 15 }, (_, i) => i + 1)), [], ['KJV']);
    const out = formatQuery({ query: 'x', diff }, 10);
    expect(out.filter(l => l.includes('only sphinx   KJV'))).toHaveLength(10);
    expect(out.at(-1)).toContain('… 5 more only on sphinx');
    expect(shownPairs(diff, 10)).toHaveLength(10);
  });

  test('no difference is one "same" line per query and a count line per version', () => {
    const out = formatQuery({ query: 'water', diff: diffSets(h('KJV', 1), h('KJV', 1), ['KJV']) });
    expect(out).toEqual(['same  "water"', '  KJV   sphinx      1  fallback      1']);
  });
});

describe('firstPass', () => {
  const many = (version, n, from = 1) => h(version, ...Array.from({ length: n }, (_, i) => from + i));
  test('both past the requery threshold: the same decision, sets not compared (the fallback stops early)', () => {
    const r = firstPass(many('KJV', 400), many('KJV', 301, 50), ['KJV'], 300);
    expect(r.requery).toBe(true);
    expect(hasDifference(r.diff)).toBe(false);
    expect(r.notes).toEqual([]);
  });
  test('both under it: these are the results, so the sets must match', () => {
    const r = firstPass(h('KJV', 1, 2), h('ASV', 1), ['KJV', 'ASV'], 300);
    expect(r.requery).toBe(false);
    expect(r.diff.get('KJV').onlyA).toEqual([1, 2]);
    expect(r.diff.get('ASV').onlyB).toEqual([1]);
  });
  test('one side past it: a difference, with a note saying which side requeries', () => {
    const r = firstPass(many('KJV', 301), many('KJV', 200), ['KJV'], 300);
    expect(r.requery).toBe(true);
    expect(hasDifference(r.diff)).toBe(true);
    expect(r.notes).toEqual(['first pass: only sphinx went past 300 hits (sphinx 301, fallback 200)']);
  });
});

describe('formatQuery label', () => {
  test('names the comparison after the query', () => {
    const out = formatQuery({ query: 'days', label: 'requery 1-23145', diff: diffSets(h('KJV', 1), h('KJV', 1), ['KJV']) });
    expect(out[0]).toBe('same  "days"  [requery 1-23145]');
  });
});
