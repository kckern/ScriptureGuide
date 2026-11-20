import { readFileSync } from 'node:fs';
import { describe, test, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';

// public/js/prefs.js runs in the page head as a plain script; load it into a jsdom window.
const SRC = readFileSync(new URL('../../public/js/prefs.js', import.meta.url), 'utf8');

function load(seed = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://scripture.guide/', runScripts: 'outside-only' });
  for (const [k, v] of Object.entries(seed)) dom.window.localStorage.setItem(k, v);
  dom.window.eval(SRC);
  return dom.window;
}

// A Storage-like object over a Map
function memoryStore(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    map: m,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
  };
}

const DEFAULTS = { verseNumbers: false, twoColumn: true, parallel: true, facsimile: true, audio: true, verpanel: 'ver' };

describe('prefs.js defaults', () => {
  test('a new visitor gets the defaults and nothing is written', () => {
    const w = load();
    expect(w.SGPrefs.all()).toEqual(DEFAULTS);
    expect(w.localStorage.getItem('sg_prefs')).toBeNull();
  });
  test('no <html> classes for the defaults', () => {
    expect(load().document.documentElement.className).toBe('');
  });
});

describe('reading and writing', () => {
  test('set saves versioned JSON and survives a reload', () => {
    const w = load();
    w.SGPrefs.set('verseNumbers', true);
    w.SGPrefs.set('verpanel', 'ref');
    const saved = JSON.parse(w.localStorage.getItem('sg_prefs'));
    expect(saved).toEqual({ v: 1, ...DEFAULTS, verseNumbers: true, verpanel: 'ref' });
    const again = load({ sg_prefs: w.localStorage.getItem('sg_prefs') });
    expect(again.SGPrefs.get('verseNumbers')).toBe(true);
    expect(again.SGPrefs.get('verpanel')).toBe('ref');
  });
  test('set rejects unknown keys and mistyped values', () => {
    const w = load();
    expect(() => w.SGPrefs.set('nope', true)).toThrow();
    expect(() => w.SGPrefs.set('audio', 'false')).toThrow();
    expect(() => w.SGPrefs.set('verpanel', 'other')).toThrow();
    expect(w.SGPrefs.all()).toEqual(DEFAULTS);
  });
  test('reset goes back to the defaults and saves them', () => {
    const w = load({ sg_prefs: JSON.stringify({ v: 1, audio: false, twoColumn: false }) });
    w.SGPrefs.reset();
    expect(w.SGPrefs.all()).toEqual(DEFAULTS);
    expect(JSON.parse(w.localStorage.getItem('sg_prefs'))).toEqual({ v: 1, ...DEFAULTS });
  });
  test('stored values of the wrong type, unknown keys and another version fall back to the defaults', () => {
    const w = load({ sg_prefs: JSON.stringify({ v: 1, audio: 'false', twoColumn: false, verpanel: 'x', extra: 1 }) });
    expect(w.SGPrefs.all()).toEqual({ ...DEFAULTS, twoColumn: false });
    expect(load({ sg_prefs: JSON.stringify({ v: 2, twoColumn: false }) }).SGPrefs.all()).toEqual(DEFAULTS);
    expect(load({ sg_prefs: JSON.stringify({ twoColumn: false }) }).SGPrefs.all()).toEqual(DEFAULTS);
  });
  test('get and all hand out copies', () => {
    const w = load();
    w.SGPrefs.all().audio = false;
    w.SGPrefs.defaults().audio = false;
    expect(w.SGPrefs.get('audio')).toBe(true);
  });
});

describe('bad JSON', () => {
  test.each(['{', 'null', '"text"', '[]', '42', ''])('%j reads as the defaults', raw => {
    expect(load({ sg_prefs: raw }).SGPrefs.all()).toEqual(DEFAULTS);
  });
  test('a change after bad JSON writes good JSON', () => {
    const w = load({ sg_prefs: '{' });
    w.SGPrefs.set('audio', false);
    expect(JSON.parse(w.localStorage.getItem('sg_prefs')).audio).toBe(false);
  });
});

describe('migration from localStorage "verses"', () => {
  test.each([['1', true], ['0', false]])('verses=%s becomes verseNumbers=%s and the old key goes', (verses, on) => {
    const w = load({ verses });
    expect(w.SGPrefs.get('verseNumbers')).toBe(on);
    expect(JSON.parse(w.localStorage.getItem('sg_prefs'))).toEqual({ v: 1, ...DEFAULTS, verseNumbers: on });
    expect(w.localStorage.getItem('verses')).toBeNull();
  });
  test('an existing sg_prefs wins over a stray "verses"', () => {
    const w = load({ verses: '1', sg_prefs: JSON.stringify({ v: 1, verseNumbers: false }) });
    expect(w.SGPrefs.get('verseNumbers')).toBe(false);
  });
  test('an unknown "verses" value is ignored', () => {
    const w = load({ verses: 'yes' });
    expect(w.SGPrefs.get('verseNumbers')).toBe(false);
    expect(w.localStorage.getItem('sg_prefs')).toBeNull();
  });
  test('the old key stays when the new one cannot be written', () => {
    const store = memoryStore({ verses: '1' });
    store.setItem = () => { throw new Error('QuotaExceededError'); };
    const w = load();
    const p = w.SGPrefs.create(store);
    expect(p.get('verseNumbers')).toBe(true);
    expect(store.map.get('verses')).toBe('1');
  });
});

describe('when storage throws (private mode, blocked site data)', () => {
  const throwing = () => ({
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('SecurityError'); },
    removeItem() { throw new Error('SecurityError'); },
  });
  test('every call falls back to the defaults and changes last for the page', () => {
    const w = load();
    const p = w.SGPrefs.create(throwing());
    expect(p.all()).toEqual(DEFAULTS);
    expect(() => p.set('audio', false)).not.toThrow();
    expect(p.get('audio')).toBe(false);
    expect(() => p.reset()).not.toThrow();
  });
  test('the localStorage getter itself throwing', () => {
    const w = load();
    const p = w.SGPrefs.create(() => { throw new Error('SecurityError'); });
    expect(p.all()).toEqual(DEFAULTS);
    expect(() => p.set('twoColumn', false)).not.toThrow();
  });
  test('no storage at all', () => {
    const p = load().SGPrefs.create(null);
    expect(p.all()).toEqual(DEFAULTS);
    p.set('verseNumbers', true);
    expect(p.get('verseNumbers')).toBe(true);
  });
  test('the page script loads when window.localStorage throws', () => {
    const dom = new JSDOM('<!doctype html><html></html>', { url: 'https://scripture.guide/', runScripts: 'outside-only' });
    Object.defineProperty(dom.window, 'localStorage', { get() { throw new Error('SecurityError'); } });
    dom.window.eval(SRC);
    expect(dom.window.SGPrefs.all()).toEqual(DEFAULTS);
    dom.window.SGPrefs.set('audio', false);
    expect(dom.window.document.documentElement.classList.contains('sg-no-audio')).toBe(true);
  });
});

describe('change events and <html> classes', () => {
  test('listeners hear each changed key once, and can unsubscribe', () => {
    const w = load();
    const fn = vi.fn();
    const off = w.SGPrefs.on(fn);
    w.SGPrefs.set('audio', false);
    w.SGPrefs.set('audio', false); // no change, no event
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toBe('audio');
    expect(fn.mock.calls[0][1]).toBe(false);
    expect(fn.mock.calls[0][2]).toMatchObject({ audio: false });
    w.SGPrefs.set('verseNumbers', true);
    fn.mockClear();
    w.SGPrefs.reset();
    expect(fn.mock.calls.map(c => c[0]).sort()).toEqual(['audio', 'verseNumbers']);
    off();
    w.SGPrefs.set('audio', false);
    expect(fn).toHaveBeenCalledTimes(2);
  });
  test('a throwing listener does not stop the others', () => {
    const w = load();
    const fn = vi.fn();
    w.console.error = () => {};
    w.SGPrefs.on(() => { throw new Error('boom'); });
    w.SGPrefs.on(fn);
    w.SGPrefs.set('parallel', false);
    expect(fn).toHaveBeenCalled();
  });
  test('classes are set from storage at load and follow changes', () => {
    const w = load({ sg_prefs: JSON.stringify({ v: 1, parallel: false, twoColumn: false }) });
    const cl = w.document.documentElement.classList;
    expect([...cl].sort()).toEqual(['sg-no-parallel', 'sg-one-column']);
    w.SGPrefs.set('audio', false);
    w.SGPrefs.set('facsimile', false);
    w.SGPrefs.set('twoColumn', true);
    expect([...cl].sort()).toEqual(['sg-no-audio', 'sg-no-facsimile', 'sg-no-parallel']);
    w.SGPrefs.reset();
    expect(cl.length).toBe(0);
  });
  test('sg-vnums follows the verse-number preference', () => {
    const w = load({ sg_prefs: JSON.stringify({ v: 1, verseNumbers: true }) });
    const cl = w.document.documentElement.classList;
    expect(cl.contains('sg-vnums')).toBe(true);
    w.SGPrefs.set('verseNumbers', false);
    expect(cl.contains('sg-vnums')).toBe(false);
  });
  test('a change in another tab (storage event) is picked up', () => {
    const w = load();
    const fn = vi.fn();
    w.SGPrefs.on(fn);
    w.localStorage.setItem('sg_prefs', JSON.stringify({ v: 1, audio: false }));
    w.dispatchEvent(new w.StorageEvent('storage', { key: 'sg_prefs' }));
    expect(w.SGPrefs.get('audio')).toBe(false);
    expect(fn).toHaveBeenCalledWith('audio', false, expect.anything());
    expect(w.document.documentElement.classList.contains('sg-no-audio')).toBe(true);
  });
});
