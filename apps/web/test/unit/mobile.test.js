import { readFileSync } from 'node:fs';
import { describe, test, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import request from 'supertest';

vi.mock('../../src/data/db/connection.js', () => ({ default: { query: async () => [] } }));
const { createApp } = await import('../../src/app/createApp.js');
const app = createApp({ log: false });

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID_PHONE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const ANDROID_TABLET = 'Mozilla/5.0 (Linux; Android 14; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

describe('server-side phone detection (the <html> class)', () => {
  const page = (ua, hint) => {
    const r = request(app).get('/').set('Host', 'scripture.guide').set('User-Agent', ua);
    return hint ? r.set('Sec-CH-UA-Mobile', hint) : r;
  };
  test.each([
    ['iPhone', IPHONE, true],
    ['Android phone', ANDROID_PHONE, true],
    ['iPad', IPAD, false],
    ['Android tablet', ANDROID_TABLET, false],
    ['Mac', MAC, false],
  ])('%s', async (_n, ua, mobile) => {
    const res = await page(ua);
    expect(/^<html[^>]*class="sg-mobile"/.test(res.text.trimStart())).toBe(mobile);
  });
  test('the Client Hints flag wins over the User-Agent', async () => {
    expect((await page(MAC, '?1')).text).toMatch(/<html[^>]*class="sg-mobile"/);
    expect((await page(IPHONE, '?0')).text).not.toMatch(/class="sg-mobile"/);
  });
  test('the answer varies by what it was sniffed from, and the page loads the phone CSS and script', async () => {
    const res = await page(IPHONE);
    expect(res.headers.vary).toMatch(/User-Agent/i);
    expect(res.headers.vary).toMatch(/Sec-CH-UA-Mobile/i);
    expect(res.text).toMatch(/\/css\/mobile\.css/);
    expect(res.text).toMatch(/\/js\/device\.js/);
    expect(res.text).toMatch(/viewport-fit=cover/);
  });
});

describe('device.js (the same decision in the browser)', () => {
  const DEVICE = readFileSync(new URL('../../public/js/device.js', import.meta.url), 'utf8');
  const PREFS = readFileSync(new URL('../../public/js/prefs.js', import.meta.url), 'utf8');
  function load({ ua, mobileHint, narrow = false }) {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://scripture.guide/', runScripts: 'outside-only' });
    const w = dom.window;
    Object.defineProperty(w.navigator, 'userAgent', { value: ua });
    const listeners = [];
    const mq = { matches: narrow, addEventListener: (_e, f) => listeners.push(f) };
    w.matchMedia = () => mq;
    if (mobileHint !== undefined) Object.defineProperty(w.navigator, 'userAgentData', { value: { mobile: mobileHint } });
    w.eval(PREFS);
    w.eval(DEVICE);
    return { w, cls: () => w.document.documentElement.classList, resize: v => { mq.matches = v; listeners.forEach(f => f()); } };
  }
  test('a phone is mobile and one column', () => {
    const { cls } = load({ ua: IPHONE });
    expect(cls().contains('sg-mobile')).toBe(true);
    expect(cls().contains('sg-one-column')).toBe(true);
  });
  test('a tablet or a desktop is not', () => {
    expect(load({ ua: IPAD }).cls().contains('sg-mobile')).toBe(false);
    const d = load({ ua: MAC });
    expect(d.cls().contains('sg-mobile')).toBe(false);
    expect(d.cls().contains('sg-one-column')).toBe(false);
  });
  test('a window of 700px or less is mobile, and follows the window', () => {
    const t = load({ ua: MAC, narrow: true });
    expect(t.cls().contains('sg-mobile')).toBe(true);
    t.resize(false);
    expect(t.cls().contains('sg-mobile')).toBe(false);
    expect(t.cls().contains('sg-one-column')).toBe(false);
  });
  test('Client Hints say what the User-Agent cannot', () => {
    expect(load({ ua: MAC, mobileHint: true }).cls().contains('sg-mobile')).toBe(true);
    expect(load({ ua: ANDROID_TABLET, mobileHint: false }).cls().contains('sg-mobile')).toBe(false);
  });
});

describe('swipe.js (chapter swipes on a phone)', () => {
  const SWIPE = readFileSync(new URL('../../public/js/swipe.js', import.meta.url), 'utf8');
  function page({ mobile = true } = {}) {
    const dom = new JSDOM(`<!doctype html><html${mobile ? ' class="sg-mobile"' : ''}><body><p id="t">text</p><input id="f"><a class="prev" href="/p">p</a><a class="next" href="/n">n</a></body></html>`, { url: 'https://scripture.guide/', runScripts: 'outside-only' });
    const w = dom.window;
    const clicks = [];
    w.document.querySelectorAll('a').forEach(a => a.addEventListener('click', e => { e.preventDefault(); clicks.push(a.className); }));
    w.eval(SWIPE);
    const touch = (type, id, x, y) => {
      const ev = new w.Event(type, { bubbles: true });
      const pt = { clientX: x, clientY: y };
      ev.touches = type === 'touchend' ? [] : [pt];
      ev.changedTouches = [pt];
      w.document.getElementById(id).dispatchEvent(ev);
    };
    const swipe = (dx, dy = 0, id = 't') => { touch('touchstart', id, 200, 300); touch('touchend', id, 200 + dx, 300 + dy); return clicks.slice(); };
    return { swipe, clicks };
  }
  test('left goes to the next chapter, right to the previous', () => {
    expect(page().swipe(-100)).toEqual(['next']);
    expect(page().swipe(100)).toEqual(['prev']);
  });
  test('short, mostly vertical, form-field and desktop swipes do nothing', () => {
    expect(page().swipe(-30)).toEqual([]);
    expect(page().swipe(-100, 90)).toEqual([]);
    expect(page().swipe(-100, 0, 'f')).toEqual([]);
    expect(page({ mobile: false }).swipe(-100)).toEqual([]);
  });
});
