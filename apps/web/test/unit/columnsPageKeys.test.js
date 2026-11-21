import { readFileSync } from 'node:fs';
import { describe, test, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';

// public/js/columns.js runs as a plain script at the end of <body>; load it into a jsdom window.
// PageDown / Space and PageUp / Shift+Space move by its two-column blocks.
const SRC = readFileSync(new URL('../../public/js/columns.js', import.meta.url), 'utf8');

// A page whose blocks sit at the given document tops (px), the window `height` high, scrolled to `y`
function load({ tops = [100, 900, 1700, 2500], y = 0, height = 800, width = 1280, html = '', oneColumn = false } = {}) {
  const blocks = tops.map((t, i) => `<div class="vcols${i ? ' vcols-split' : ''}" data-top="${t}"><p>v${i}</p></div>`).join('');
  const dom = new JSDOM(`<!doctype html><html${oneColumn ? ' class="sg-one-column"' : ''}><head></head><body><input id="box"><textarea id="ta"></textarea><button id="btn">b</button><div id="ce" contenteditable="true">x</div><div class="passage">${blocks}</div>${html}</body></html>`, { url: 'https://scripture.guide/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  let scrollY = y;
  Object.defineProperty(w, 'scrollY', { configurable: true, get: () => scrollY });
  Object.defineProperty(w, 'pageYOffset', { configurable: true, get: () => scrollY });
  Object.defineProperty(w, 'innerHeight', { configurable: true, value: height });
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: width });
  w.scrollTo = vi.fn(opts => { scrollY = opts.top; });
  w.document.querySelectorAll('.vcols').forEach(el => {
    const top = Number(el.getAttribute('data-top'));
    el.getBoundingClientRect = () => ({ top: top - scrollY, bottom: top - scrollY + 700, height: 700, left: 0, right: 1000, width: 1000 });
  });
  w.eval(SRC);
  return w;
}

// Dispatch a keydown on `target` (default: the body); returns the event
function press(w, key, opts = {}, target = w.document.body) {
  const e = new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts });
  target.dispatchEvent(e);
  return e;
}

describe('pageTarget', () => {
  const tops = [100, 900, 1700];
  const pt = (...a) => load().SGColumns.pageTarget(...a);

  test('next: the first block below the scroll position', () => {
    expect(pt(tops, 100, 800, 1)).toBe(900);
    expect(pt(tops, 0, 800, 1)).toBe(100);
    expect(pt(tops, 500, 800, 1)).toBe(900);
  });
  test('previous: the last block above the scroll position', () => {
    expect(pt(tops, 1700, 800, -1)).toBe(900);
    expect(pt(tops, 1200, 800, -1)).toBe(900);
    expect(pt(tops, 900, 800, -1)).toBe(100);
  });
  test('nothing past the last block or before the first', () => {
    expect(pt(tops, 1700, 800, 1)).toBeNull();
    expect(pt(tops, 2000, 800, 1)).toBeNull();
    expect(pt(tops, 100, 800, -1)).toBeNull();
    expect(pt(tops, 50, 800, -1)).toBeNull();
  });
  test('nothing when the block is farther than a screen away', () => {
    expect(pt([100, 1200], 100, 800, 1)).toBeNull();
    expect(pt([100, 1200], 1200, 800, -1)).toBeNull();
    expect(pt([100, 900], 100, 800, 1)).toBe(900); // exactly one screen is fine
  });
  test('a block within a few px of the scroll position counts as the current one', () => {
    expect(pt(tops, 897, 900, 1)).toBe(1700);
    expect(pt(tops, 902.5, 900, 1)).toBe(1700);
    expect(pt(tops, 903, 900, -1)).toBe(100);
    expect(pt(tops, 897, 900, -1)).toBe(100);
    expect(pt(tops, 890, 900, 1)).toBe(900); // more than a few px: the next block
  });
  test('no blocks: nothing', () => {
    expect(pt([], 0, 800, 1)).toBeNull();
    expect(pt([], 0, 800, -1)).toBeNull();
  });
});

describe('page keys', () => {
  test('PageDown and Space scroll to the next block and take the key', () => {
    const w = load({ y: 100 });
    const e = press(w, 'PageDown');
    expect(w.scrollTo).toHaveBeenLastCalledWith({ top: 900, behavior: 'auto' });
    expect(e.defaultPrevented).toBe(true);
    const s = press(w, ' ');
    expect(w.scrollTo).toHaveBeenLastCalledWith({ top: 1700, behavior: 'auto' });
    expect(s.defaultPrevented).toBe(true);
  });
  test('PageUp and Shift+Space scroll to the previous block', () => {
    const w = load({ y: 2500 });
    expect(press(w, 'PageUp').defaultPrevented).toBe(true);
    expect(w.scrollTo).toHaveBeenLastCalledWith({ top: 1700, behavior: 'auto' });
    expect(press(w, ' ', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(w.scrollTo).toHaveBeenLastCalledWith({ top: 900, behavior: 'auto' });
  });
  test('past the last block, or with a block too far, the browser scrolls', () => {
    const w = load({ y: 2500 });
    expect(press(w, 'PageDown').defaultPrevented).toBe(false);
    const far = load({ tops: [100, 2000], y: 100 });
    expect(press(far, 'PageDown').defaultPrevented).toBe(false);
    expect(far.scrollTo).not.toHaveBeenCalled();
  });
  test('Ctrl, Alt or Meta: the browser handles the key', () => {
    for (const mod of ['ctrlKey', 'altKey', 'metaKey']) {
      const w = load({ y: 100 });
      expect(press(w, 'PageDown', { [mod]: true }).defaultPrevented).toBe(false);
      expect(w.scrollTo).not.toHaveBeenCalled();
    }
  });
  test('typing in an input, textarea or contenteditable is left alone', () => {
    const w = load({ y: 100 });
    for (const id of ['box', 'ta', 'ce']) {
      expect(press(w, ' ', {}, w.document.getElementById(id)).defaultPrevented).toBe(false);
      expect(press(w, 'PageDown', {}, w.document.getElementById(id)).defaultPrevented).toBe(false);
    }
    expect(w.scrollTo).not.toHaveBeenCalled();
  });
  test('Space on a button presses the button; PageDown there still pages', () => {
    const w = load({ y: 100 });
    const btn = w.document.getElementById('btn');
    expect(press(w, ' ', {}, btn).defaultPrevented).toBe(false);
    expect(press(w, 'PageDown', {}, btn).defaultPrevented).toBe(true);
  });
  test('the preferences panel open: the browser handles the key', () => {
    const w = load({ y: 100, html: '<div id="sg_prefs_panel" class="sgp open"></div>' });
    expect(press(w, 'PageDown').defaultPrevented).toBe(false);
    w.document.getElementById('sg_prefs_panel').classList.remove('open');
    expect(press(w, 'PageDown').defaultPrevented).toBe(true);
  });
  test('a featherlight box, the versions box or the paste box open: the browser handles the key', () => {
    expect(press(load({ y: 100, html: '<div class="featherlight"></div>' }), 'PageDown').defaultPrevented).toBe(false);
    expect(press(load({ y: 100, html: '<div class="versionsbox" style="display:block"></div>' }), 'PageDown').defaultPrevented).toBe(false);
    expect(press(load({ y: 100, html: '<div class="versionsbox" style="display:none"></div>' }), 'PageDown').defaultPrevented).toBe(true);
    expect(press(load({ y: 100, html: '<textarea id="pastebin" style="display:block"></textarea>' }), 'PageDown').defaultPrevented).toBe(false);
  });
  test('two columns off or a narrow window: the browser handles the key', () => {
    expect(press(load({ y: 100, oneColumn: true }), 'PageDown').defaultPrevented).toBe(false);
    expect(press(load({ y: 100, width: 600 }), 'PageDown').defaultPrevented).toBe(false);
  });
  test('no blocks on the page: the browser handles the key', () => {
    const w = load({ tops: [] });
    expect(press(w, 'PageDown').defaultPrevented).toBe(false);
  });
  test('a key another handler already took is left alone', () => {
    const w = load({ y: 100 });
    w.document.getElementById('btn').addEventListener('keydown', e => e.preventDefault());
    press(w, 'PageDown', {}, w.document.getElementById('btn'));
    expect(w.scrollTo).not.toHaveBeenCalled();
  });
});
