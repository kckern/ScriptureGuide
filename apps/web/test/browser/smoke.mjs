#!/usr/bin/env node
// Browser smoke suite: load each page of pages.mjs on the live PHP site and on the Node app in
// Chromium, compare screenshots, and drive the reader's interactions on the Node page.
//
//   node test/browser/smoke.mjs [--only <name|path>] [--reuse-live] [--font-mode normalize|native]
//
// Env:
//   NODE_BASE        Node app (default http://127.0.0.1:3101), against a full copy of the database
//   LIVE_BASE        live site (default https://scripture.guide)
//   PIXEL_THRESHOLD  share of differing pixels that fails a page (default 0.005, i.e. 0.5%)
//   FONT_MODE        normalize (default) or native; see "Fonts" below
//   FONT_CHECK_BASE  a second Node app started with FONT_DIR/FONT_BASE, to assert the private
//                    font loads there (optional; NODE_BASE is checked too when it serves the font)
//
// Per page: screenshots at 1280x900 after networkidle, document.fonts.ready and the end of
// jQuery animations; pixelmatch (threshold 0.1) of live against Node, written to
// .out/<name>.{live,node,diff}.png. On the Node page only: console errors, page errors, failed
// requests and responses >= 400 fail the page, and the interactions listed in pages.mjs run.
//
// Fonts: live sets body text in 'Sorts Mill Goudy' with Goudy Old Style ('Goudy') as fallback;
// Node sets it in the owner's licensed 'Goudy Scripture' when FONT_DIR/FONT_BASE is configured,
// else Sorts Mill Goudy. A different text font moves every glyph, so a pixel diff then measures
// the font and hides layout. In normalize mode both pages get the same override appended to
// <head>: 'Goudy Scripture' and 'Goudy' are redeclared as the repository's Sorts Mill Goudy
// (the last-declared matching face wins), so the screenshots compare layout with one text
// font. Every other family (Yanone Kaffeesatz headings, Korean web fonts) is left alone.
// Whether the private font itself loads is a separate assertion (fontCheck). native mode skips
// the override, to see the real difference.
//
// Live requests: one page load per page, sequential. --reuse-live reuses .out/<name>.live.png
// from an earlier run instead of loading live again.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { PAGES, SHARED_WITH_LIVE } from './pages.mjs';

const sharedWithLive = text => SHARED_WITH_LIVE.find(k => !k.echo && k.re.test(text));

const OUT = new URL('./.out/', import.meta.url).pathname;
const NODE_BASE = (process.env.NODE_BASE || 'http://127.0.0.1:3101').replace(/\/$/, '');
const LIVE_BASE = (process.env.LIVE_BASE || 'https://scripture.guide').replace(/\/$/, '');
const PIXEL_THRESHOLD = Number(process.env.PIXEL_THRESHOLD ?? 0.005);
const FONT_CHECK_BASE = process.env.FONT_CHECK_BASE?.replace(/\/$/, '');
const VIEWPORT = { width: 1280, height: 900 };

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const only = opt('--only');
const reuseLive = args.includes('--reuse-live');
const FONT_MODE = opt('--font-mode') || process.env.FONT_MODE || 'normalize';
if (!['normalize', 'native'].includes(FONT_MODE)) throw new Error(`FONT_MODE ${FONT_MODE}: normalize or native`);

const NORMALIZE_CSS = ['Goudy Scripture', 'Goudy'].map(family => `
@font-face { font-family: '${family}'; src: url('/css/webfont/SortsMillGoudy-Regular.woff') format('woff'); font-weight: 400; font-style: normal; }
@font-face { font-family: '${family}'; src: url('/css/webfont/SortsMillGoudy-Italic.woff') format('woff'); font-weight: 400; font-style: italic; }`).join('');

mkdirSync(OUT, { recursive: true });

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  // main.js fades headings and buttons in with jQuery; wait for them to finish.
  await page.waitForFunction(() => !window.jQuery || window.jQuery(':animated').length === 0, null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);
}

async function open(context, url) {
  const page = await context.newPage();
  const problems = [];
  page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', r => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('response', r => { if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  if (FONT_MODE === 'normalize') {
    // Appended once the DOM is parsed, after the page's own stylesheets and <style id="private-fonts">.
    await page.addInitScript(css => {
      document.addEventListener('DOMContentLoaded', () => {
        const s = document.createElement('style');
        s.id = 'smoke-font-normalize';
        s.textContent = css;
        document.head.appendChild(s);
      });
    }, NORMALIZE_CSS);
  }
  const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await settle(page);
  return { page, problems, status: res?.status() };
}

async function screenshot(page, file, mask) {
  return page.screenshot({
    path: file,
    animations: 'disabled',
    caret: 'hide',
    mask: (mask || []).map(sel => page.locator(sel)),
    maskColor: '#FF00FF',
  });
}

function compare(livePng, nodePng, diffFile) {
  const a = PNG.sync.read(livePng);
  const b = PNG.sync.read(nodePng);
  if (a.width !== b.width || a.height !== b.height) return { ratio: 1, note: `size ${a.width}x${a.height} vs ${b.width}x${b.height}` };
  const diff = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
  writeFileSync(diffFile, PNG.sync.write(diff));
  return { ratio: n / (a.width * a.height) };
}

// --- interactions on the Node page ---------------------------------------------------------

const INTERACTIONS = {
  // The version box opens on the verse's context menu (main.js: featherlight openTrigger "contextmenu").
  async versebox(page) {
    await page.locator('.verse').first().click({ button: 'right' });
    const box = page.locator('.featherlight .versebox');
    await box.waitFor({ state: 'visible', timeout: 15000 });
    const tabs = await box.locator('.paneltabs li').allInnerTexts();
    if (!tabs.some(t => /\bVersions\b/.test(t))) throw new Error(`tabs ${JSON.stringify(tabs)} have no "Versions"`);
    await page.keyboard.press('Escape');
    await page.locator('.featherlight').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    return `tabs ${tabs.map(t => t.trim()).join(' | ')}`;
  },

  async copy(page) {
    const button = page.locator('.containerCopy > div');
    if (await button.count() === 0) throw new Error('no .containerCopy button');
    await page.evaluate(() => navigator.clipboard.writeText(''));
    await button.first().click();
    await page.waitForFunction(async () => (await navigator.clipboard.readText()).trim() !== '', null, { timeout: 5000 })
      .catch(() => { throw new Error('clipboard stayed empty'); });
    const text = await page.evaluate(() => navigator.clipboard.readText());
    return `${text.length} chars: ${JSON.stringify(text.slice(0, 60))}...${JSON.stringify(text.slice(-40))}`;
  },

  // Clicking the heading's cover posts /versionselect and shows img.option covers in .versionsbox.
  async versions(page) {
    const cover = page.locator('h3 h4 img.cover').first();
    await cover.waitFor({ state: 'visible', timeout: 10000 });
    await cover.click();
    const options = page.locator('.versionsbox img.option');
    await options.first().waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => [...document.querySelectorAll('.versionsbox img.option')].every(i => i.complete), null, { timeout: 15000 })
      .catch(() => {});
    const sizes = await options.evaluateAll(imgs => imgs.map(i => ({ src: i.getAttribute('src'), w: i.naturalWidth })));
    const unloaded = sizes.filter(s => !(s.w > 0));
    const known = unloaded.filter(s => sharedWithLive(s.src));
    const broken = unloaded.filter(s => !sharedWithLive(s.src));
    if (broken.length) throw new Error(`${broken.length}/${sizes.length} covers not loaded: ${broken.slice(0, 3).map(s => s.src).join(', ')}`);
    return `${sizes.length - unloaded.length}/${sizes.length} covers loaded${known.length ? ` (missing on live too: ${known.map(s => s.src).join(', ')})` : ''}`;
  },
};

// Asserts the licensed text font is declared, fetched and used, on a Node app that serves it.
async function fontCheck(context, base, path = '/1ne.3.7') {
  const page = await context.newPage();
  const fontResponses = [];
  page.on('response', r => { if (/\/private-fonts\/|scripture\.woff2?$/.test(r.url())) fontResponses.push(`${r.status()} ${r.url()}`); });
  await page.goto(base + path, { waitUntil: 'networkidle', timeout: 45000 });
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(() => {
    const decl = !!document.getElementById('private-fonts');
    const faces = [...document.fonts].filter(f => f.family.replace(/["']/g, '') === 'Goudy Scripture')
      .map(f => `${f.style}:${f.status}`);
    const verse = document.querySelector('.verse');
    return {
      decl,
      faces,
      family: verse && getComputedStyle(verse).fontFamily,
      check: document.fonts.check('16px "Goudy Scripture"'),
    };
  });
  await page.close();
  if (!r.decl) return { ok: null, detail: 'no <style id="private-fonts"> (font not configured)' };
  const upright = r.faces.includes('normal:loaded');
  const fetched = fontResponses.some(l => l.startsWith('200 '));
  const used = /^\s*["']?Goudy Scripture/.test(r.family || '');
  const ok = upright && fetched && used;
  return { ok, detail: `faces ${r.faces.join(',') || 'none'}; responses ${fontResponses.join(', ') || 'none'}; .verse font-family ${r.family}` };
}

// --- run ---------------------------------------------------------------------------------------

const pages = PAGES.filter(p => !only || p.name === only || p.path === only);
if (!pages.length) throw new Error(`no page matches ${only}`);

const browser = await chromium.launch();
const contextOptions = { viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: 'light', locale: 'en-US', timezoneId: 'UTC' };
const liveContext = await browser.newContext(contextOptions);
const nodeContext = await browser.newContext({ ...contextOptions, permissions: ['clipboard-read', 'clipboard-write'] });
await nodeContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: NODE_BASE });

let failures = 0;
const rows = [];
console.log(`live ${LIVE_BASE}  node ${NODE_BASE}  font-mode ${FONT_MODE}  fail above ${(PIXEL_THRESHOLD * 100).toFixed(2)}%\n`);

for (const p of pages) {
  const fails = [];
  const notes = [];
  const files = { live: `${OUT}${p.name}.live.png`, node: `${OUT}${p.name}.node.png`, diff: `${OUT}${p.name}.diff.png` };

  let livePng;
  if (reuseLive && existsSync(files.live)) livePng = readFileSync(files.live);
  else {
    try {
      const { page, status } = await open(liveContext, LIVE_BASE + p.path);
      if (status >= 400) notes.push(`live HTTP ${status}`);
      livePng = await screenshot(page, files.live, p.mask);
      await page.close();
    } catch (e) { fails.push(`live: ${e.message.split('\n')[0]}`); }
  }

  let node;
  try {
    node = await open(nodeContext, NODE_BASE + p.path);
    if (node.status >= 400) fails.push(`node HTTP ${node.status}`);
    const nodePng = await screenshot(node.page, files.node, p.mask);
    if (livePng) {
      const c = compare(livePng, nodePng, files.diff);
      p.ratio = c.ratio;
      if (c.note) notes.push(c.note);
      if (c.ratio > PIXEL_THRESHOLD) fails.push(`pixels ${(c.ratio * 100).toFixed(2)}% differ`);
    }
    for (const name of p.interact || []) {
      try { notes.push(`${name}: ${await INTERACTIONS[name](node.page)}`); }
      catch (e) { fails.push(`${name}: ${e.message.split('\n')[0]}`); }
    }
    await node.page.waitForTimeout(500); // late requests from the interactions
    // Problems live has too are listed, not failed; a URL-less console echo only when such a problem explains it.
    const known = node.problems.filter(sharedWithLive);
    for (const problem of node.problems) {
      const echo = SHARED_WITH_LIVE.find(k => k.echo && k.re.test(problem));
      if (sharedWithLive(problem) || (echo && known.length)) notes.push(`shared with live: ${problem}`);
      else fails.push(problem);
    }
    await node.page.close();
  } catch (e) { fails.push(`node: ${e.message.split('\n')[0]}`); }

  const pct = p.ratio == null ? '   n/a' : `${(p.ratio * 100).toFixed(2).padStart(5)}%`;
  console.log(`${fails.length ? 'FAIL' : 'ok  '} ${pct}  ${p.path}`);
  for (const n of notes) console.log(`        ${n}`);
  for (const f of fails) console.log(`     !  ${f}`);
  rows.push({ name: p.name, path: p.path, diff: p.ratio, fails, notes });
  if (fails.length) failures++;
}

// The private font: on NODE_BASE when it serves it, and on FONT_CHECK_BASE when given.
for (const base of [NODE_BASE, FONT_CHECK_BASE].filter(Boolean)) {
  const ctx = await browser.newContext(contextOptions);
  try {
    const r = await fontCheck(ctx, base);
    const required = base === FONT_CHECK_BASE;
    if (r.ok === null && !required) { console.log(`\nfont  ${base}: ${r.detail}`); continue; }
    const ok = r.ok === true;
    console.log(`\n${ok ? 'ok  ' : 'FAIL'} font ${base}: ${r.detail}`);
    if (!ok) failures++;
  } finally { await ctx.close(); }
}

writeFileSync(`${OUT}report.json`, JSON.stringify({ NODE_BASE, LIVE_BASE, FONT_MODE, PIXEL_THRESHOLD, rows }, null, 2));
await browser.close();
console.log(`\n${pages.length - rows.filter(r => r.fails.length).length}/${pages.length} pages pass; images in ${OUT}`);
process.exit(failures ? 1 : 0);
