/**
 * The real content script in jsdom, with a fake chrome object. Parse requests go to the real
 * background handler (parseChunks), or fail, to exercise the page-thread fallback.
 */
import { parseChunks } from '../../src/background/parse.js';

const waitFor = async (check, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
};

function installChrome(send, appearance = { footnoteLinks: false, useScriptureFont: false }) {
  const listeners = [];
  global.chrome = {
    storage: {
      sync: { get: async () => ({ appearance }) },
      local: { get: async () => ({}), set: async () => {} },
      onChanged: { addListener() {} }
    },
    runtime: { sendMessage: send, onMessage: { addListener: (fn) => listeners.push(fn) }, getURL: (p) => p }
  };
  return listeners;
}

function runContentScript() {
  delete window.__sgActive;
  jest.isolateModules(() => { require('../../src/content/index.js'); });
}

const links = () => [...document.querySelectorAll('a.sg_autolink')].map((a) => a.textContent);

describe('content script', () => {
  test('links references parsed by the background worker', async () => {
    document.body.innerHTML = '<p>Jesus taught in John 3:16 about love.</p><p>Read Alma 32:21 too.</p>';
    const send = jest.fn(async (msg) => (msg.type === 'sg-parse' ? parseChunks(msg) : undefined));
    installChrome(send);
    runContentScript();
    expect(await waitFor(() => links().length === 2)).toBe(true);
    expect(links()).toEqual(['John 3:16', 'Alma 32:21']);
    expect(send.mock.calls.some(([m]) => m.type === 'sg-parse')).toBe(true);
  });

  test('without a worker, references are still linked on the page thread', async () => {
    document.body.innerHTML = '<p>Jesus taught in John 3:16 about love.</p>';
    installChrome(jest.fn(async () => { throw new Error('Receiving end does not exist'); }));
    runContentScript();
    expect(await waitFor(() => links().length === 1)).toBe(true);
  });

  test('a long text node is sent in chunks and every reference lands in place', async () => {
    const sentence = 'In the beginning of the story we read Genesis 1:1 again. ';
    document.body.innerHTML = '<p></p>';
    document.querySelector('p').textContent = sentence.repeat(120); // ~7 KB
    const sizes = [];
    installChrome(jest.fn(async (msg) => {
      if (msg.type !== 'sg-parse') return undefined;
      sizes.push(...msg.chunks.map((c) => c.length));
      return parseChunks(msg);
    }));
    runContentScript();
    expect(await waitFor(() => links().length === 120)).toBe(true);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(2000);
    expect(document.querySelector('p').textContent).toBe(sentence.repeat(120));
  });

  test('reports its state and can be resumed', async () => {
    document.body.innerHTML = '<p>John 3:16</p>';
    const listeners = installChrome(jest.fn(async (msg) => (msg.type === 'sg-parse' ? parseChunks(msg) : undefined)));
    runContentScript();
    expect(await waitFor(() => listeners.length > 0)).toBe(true);
    const reply = jest.fn();
    listeners.forEach((fn) => fn({ type: 'sg-get-state' }, {}, reply));
    expect(reply).toHaveBeenCalledWith({ state: 'normal' });
  });

  test('a site link whose text is a reference becomes a badge, keeping the original link', async () => {
    document.body.innerHTML = '<p>saved.\u201d\u2014<a class="jsBibleLink" href="https://www.jw.org/acts/4/">Acts 4:12</a>. And <a href="/fn1">see note 3 on page 12</a>.</p>';
    installChrome(jest.fn(async (msg) => (msg.type === 'sg-parse' ? parseChunks(msg) : undefined)),
      { footnoteLinks: true, useScriptureFont: false });
    runContentScript();
    expect(await waitFor(() => document.querySelector('a.sg_takeover'))).toBe(true);
    const badge = document.querySelector('a.sg_takeover');
    expect(badge.textContent).toBe('Acts 4:12');
    expect(badge.getAttribute('href')).toBe('https://scripture.guide/acts.4.12');
    expect(badge.nextElementSibling.getAttribute('href')).toBe('https://www.jw.org/acts/4/');
    expect(document.querySelector('a.jsBibleLink')).toBeNull();
    expect(document.querySelector('a[href="/fn1"]')).not.toBeNull();
  });

  test('injects the Goudy Scripture font when useScriptureFont is on', async () => {
    document.head.innerHTML = '';
    document.body.innerHTML = '<p>John 3:16</p>';
    installChrome(jest.fn(async (msg) => (msg.type === 'sg-parse' ? parseChunks(msg) : undefined)),
      { footnoteLinks: false, useScriptureFont: true });
    runContentScript();
    expect(await waitFor(() => document.getElementById('sg-scripture-font'))).toBe(true);
    const css = document.getElementById('sg-scripture-font').textContent;
    expect(css).toContain("font-family:'SG Goudy Scripture'");
    expect(css).toContain("url('fonts/GoudyScripture.woff2') format('woff2')");
  });

  test('no font when the old Kreon option was turned off', async () => {
    document.head.innerHTML = '';
    document.body.innerHTML = '<p>John 3:16</p>';
    installChrome(jest.fn(async (msg) => (msg.type === 'sg-parse' ? parseChunks(msg) : undefined)),
      { footnoteLinks: false, useKreonFont: false });
    runContentScript();
    expect(await waitFor(() => links().length === 1)).toBe(true);
    expect(document.getElementById('sg-scripture-font')).toBeNull();
  });
});
