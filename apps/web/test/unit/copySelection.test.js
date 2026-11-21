import { readFileSync } from 'node:fs';
import { describe, test, expect } from 'vitest';
import { JSDOM } from 'jsdom';

// public/js/copySelection.js runs in the page; load it into a jsdom window
const SRC = readFileSync(new URL('../../public/js/copySelection.js', import.meta.url), 'utf8');
function load(platform = 'MacIntel') {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
  Object.defineProperty(dom.window.navigator, 'platform', { value: platform });
  dom.window.eval(SRC);
  return dom.window.SGCopy;
}
const C = load();
// John 14 verse ids start at 26670; 15:1 is 26701
const john = (v, ch = 14) => ({ id: (ch === 14 ? 26669 : 26700) + v, ref: `John ${ch}:${v}`, version: 'KJV', text: `Text ${ch}:${v}.` });

describe('formatRefs', () => {
  test('one verse', () => expect(C.formatRefs([john(1)])).toBe('John 14:1'));
  test('a range', () => expect(C.formatRefs([1, 2, 3, 4].map(v => john(v)))).toBe('John 14:1–4'));
  test('with gaps', () => expect(C.formatRefs([1, 2, 3, 4, 6, 9, 10].map(v => john(v)))).toBe('John 14:1–4, 6, 9–10'));
  test('a range across chapters', () => expect(C.formatRefs([john(30), john(31), john(1, 15), john(2, 15)])).toBe('John 14:30–15:2'));
  test('separate verses in two chapters', () => expect(C.formatRefs([john(3), john(5, 15), john(7, 15)])).toBe('John 14:3; 15:5, 7'));
  test('two books', () => {
    const items = [{ id: 1, ref: 'Genesis 1:1' }, { id: 2, ref: 'Genesis 1:2' }, { id: 30000, ref: '1 John 1:1' }];
    expect(C.formatRefs(items)).toBe('Genesis 1:1–2; 1 John 1:1');
  });
  test('a reference it cannot read is kept as it is', () => expect(C.formatRefs([{ id: 5, ref: 'Facsimile 1' }])).toBe('Facsimile 1'));
});

describe('copyText', () => {
  test('one verse copies as before: text and reference', () => {
    expect(C.copyText([john(1)])).toBe('Text 14:1. (John 14:1)');
  });
  test('other versions are named; D&C is shortened', () => {
    expect(C.copyText([{ id: 1, ref: 'John 3:16', version: 'NIV', text: 'For God' }])).toBe('For God (John 3:16, NIV)');
    expect(C.copyText([{ id: 1, ref: 'Doctrine and Covenants 4:2', version: 'LDS', text: 'O ye' }])).toBe('O ye (D&C 4:2)');
  });
  test('several verses: one line each with its number, then the reference of all', () => {
    expect(C.copyText([1, 2, 4].map(v => john(v)))).toBe('1 Text 14:1.\n2 Text 14:2.\n4 Text 14:4. (John 14:1–2, 4)');
  });
  test('across chapters the new chapter is named at its first verse', () => {
    expect(C.copyText([john(31), john(1, 15)])).toBe('31 Text 14:31.\n15:1 Text 15:1. (John 14:31–15:1)');
  });
  test('nothing selected copies nothing', () => expect(C.copyText([])).toBe(''));
});

describe('select', () => {
  const none = { anchor: null, sel: [] };
  test('a plain click selects one verse and anchors there', () => {
    expect(C.select(none, 3, 'plain')).toEqual({ anchor: 3, sel: [3] });
    expect(C.select({ anchor: 1, sel: [1, 2] }, 5, 'plain')).toEqual({ anchor: 5, sel: [5] });
  });
  test('Shift selects from the anchor, either way', () => {
    expect(C.select({ anchor: 2, sel: [2] }, 5, 'range')).toEqual({ anchor: 2, sel: [2, 3, 4, 5] });
    expect(C.select({ anchor: 5, sel: [5] }, 2, 'range')).toEqual({ anchor: 5, sel: [2, 3, 4, 5] });
    expect(C.select({ anchor: 2, sel: [2, 3, 4, 5] }, 3, 'range')).toEqual({ anchor: 2, sel: [2, 3] });
  });
  test('Shift with no anchor acts as a plain click', () => expect(C.select(none, 4, 'range')).toEqual({ anchor: 4, sel: [4] }));
  test('Cmd/Ctrl adds and removes single verses, keeping order', () => {
    let s = C.select(none, 1, 'plain');
    s = C.select(s, 6, 'toggle');
    s = C.select(s, 3, 'toggle');
    expect(s).toEqual({ anchor: 3, sel: [1, 3, 6] });
    s = C.select(s, 6, 'toggle');
    expect(s.sel).toEqual([1, 3]);
  });
});

describe('modifier keys', () => {
  test('Mac: Cmd toggles; Ctrl (the context-menu click) does not', () => {
    const mac = load('MacIntel');
    expect(mac.modeOf({ metaKey: true })).toBe('toggle');
    expect(mac.modeOf({ ctrlKey: true })).toBe('plain');
    expect(mac.modeOf({ shiftKey: true })).toBe('range');
  });
  test('elsewhere: Ctrl toggles', () => {
    const win = load('Win32');
    expect(win.modeOf({ ctrlKey: true })).toBe('toggle');
    expect(win.modeOf({ metaKey: true })).toBe('plain');
    expect(win.modeOf({})).toBe('plain');
  });
});
