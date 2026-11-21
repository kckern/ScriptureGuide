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

describe('copyText across books', () => {
  test('when the verses come from more than one book, each line names its reference', () => {
    const items = [
      { id: 26685, ref: 'John 14:16', version: 'KJV', text: 'And I will pray.' },
      { id: 27931, ref: 'Romans 8:28', version: 'KJV', text: 'And we know.' },
    ];
    expect(C.copyText(items)).toBe('John 14:16 And I will pray.\nRomans 8:28 And we know. (John 14:16; Romans 8:28)');
  });
});

// The search page (views/search.ejs): one row per result, its copy button in a div.copybtn after
// the verse span; volfilter() hides the rows of other volumes
describe('search results', () => {
  const row = (vol, id, ref, text, hidden = false) => `
    <tr vol="${vol}"${hidden ? ' style="display:none"' : ''}><td class="searchtext">
      <span class="clipboard">${text}</span>
      <span class="verse v_${id}" verse_id="${id}" ref="${ref}" version="KJV">${text}</span>
      <div class="copybtn"><img src="/img/copy.svg"></div>
    </td></tr>`;
  function page() {
    const dom = new JSDOM(`<!doctype html><html><body><table>
      ${row('nt', 29000, 'James 1:5', 'If any of you lack wisdom,')}
      ${row('dc', 40000, 'Doctrine and Covenants 1:1', 'Hearken, O ye people', true)}
      ${row('nt', 29100, 'James 2:17', 'Even so faith,')}
      ${row('pgp', 41000, 'Joseph Smith—History 1:11', 'I at length came')}
    </table></body></html>`, { runScripts: 'outside-only' });
    Object.defineProperty(dom.window.navigator, 'platform', { value: 'MacIntel' });
    const written = [];
    Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: t => { written.push(t); return Promise.resolve(); } } });
    dom.window.eval(SRC);
    const imgs = [...dom.window.document.querySelectorAll('.copybtn img')];
    return { S: dom.window.SGCopy, imgs, written, doc: dom.window.document };
  }

  test('a plain click copies one result', () => {
    const { S, imgs, written } = page();
    S.click(imgs[0], {});
    expect(written.at(-1)).toBe('If any of you lack wisdom, (James 1:5)');
  });
  test('Shift-click copies the shown results between, not the hidden ones', () => {
    const { S, imgs, written, doc } = page();
    S.click(imgs[0], {});
    S.click(imgs[2], { shiftKey: true });
    expect(written.at(-1)).toBe('5 If any of you lack wisdom,\n2:17 Even so faith, (James 1:5; 2:17)');
    expect(doc.querySelectorAll('.verse.sg-picked')).toHaveLength(2);
  });
  test('Cmd-click picks results across books', () => {
    const { S, imgs, written } = page();
    S.click(imgs[0], {});
    S.click(imgs[3], { metaKey: true });
    expect(written.at(-1)).toBe('James 1:5 If any of you lack wisdom,\nJoseph Smith—History 1:11 I at length came (James 1:5; Joseph Smith—History 1:11)');
  });
  test('clearing after a volume tab hid picked rows unmarks them too', () => {
    const { S, imgs, doc } = page();
    S.click(imgs[0], {});
    S.click(imgs[2], { shiftKey: true });
    doc.querySelectorAll('tr')[0].style.display = 'none';
    S.clear();
    expect(doc.querySelectorAll('.verse.sg-picked')).toHaveLength(0);
    expect(imgs[0].getAttribute('src')).toBe('/img/copy.svg');
  });
});
