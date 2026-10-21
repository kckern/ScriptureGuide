#!/usr/bin/env node
// Browser smoke suite: load each page of pages.mjs on the live PHP site and on the Node app in
// Chromium, compare screenshots, and drive the reader's interactions on the Node page.
//
//   node test/browser/smoke.mjs [--only <name|path>] [--reuse-live] [--font-mode normalize|native]
//
// Env:
//   NODE_BASE          Node app (default http://127.0.0.1:3101), against a full copy of the database
//   LIVE_BASE          live site (default https://scripture.guide)
//   PIXEL_THRESHOLD    share of differing pixels that fails a page (default 0.001, i.e. 0.1%)
//   REGION_MAX_PIXELS  differing pixels in one region that fail a page (default 100; the heading
//                      buttons 9px off made regions of 267-482px, matching pages make none)
//   REGION_GAP         differing pixels at most this far apart form one region (default 2)
//   LIVE_MAX_AGE_DAYS  oldest live screenshot --reuse-live accepts (default 7)
//   FONT_MODE          normalize (default) or native; see "Fonts" below
//   FONT_CHECK_BASE    a second Node app started with FONT_DIR/FONT_BASE, to assert the private
//                      font loads there (optional; NODE_BASE is checked too when it serves the font)
//
// Per page: screenshots at 1280x900 after networkidle, document.fonts.ready and the end of
// jQuery animations; pixelmatch (threshold 0.1) of live against Node, written to
// .out/<name>.{live,node,diff}.png. A page fails when more than PIXEL_THRESHOLD of its pixels
// differ, or when any one region of differing pixels (connected, REGION_GAP apart at most) holds
// more than REGION_MAX_PIXELS: a moved button or a reflowed line is small against the page but
// shows up as one dense region. On the Node page only: console errors, page errors, failed
// requests and responses >= 400 fail the page, and the interactions listed in pages.mjs run.
// .out/report.json records every page, also when the run stops on an error.
//
// Fonts: live sets body text in 'Sorts Mill Goudy', 'Goudy' (Goudy Old Style); Node in the
// owner's licensed 'Goudy Scripture' when FONT_DIR/FONT_BASE is configured, then Sorts Mill
// Goudy. A different text font moves every glyph, so a pixel diff then measures the font and
// hides layout. In normalize mode both pages get one more face, NORMALIZE_FAMILY (the
// repository's Sorts Mill Goudy under a name neither page uses), and body, plus any .verse set in
// a text family, is restyled to NORMALIZE_STACK. The pages' own text faces then serve no glyph:
// a character Sorts Mill Goudy lacks (the "…" in the D&C 76 header) falls back to Georgia on both
// sides, rather than to Goudy Old Style on live and the licensed font on Node. Every other
// family (Yanone Kaffeesatz headings, Korean web fonts) is left alone. Whether the private font
// itself loads is a separate assertion (fontCheck). native mode skips all this, to see the real
// difference.
//
// Live requests: one page load per page, sequential; on one reader page per run the version
// selector also opens on live, to confirm SHARED_WITH_LIVE entries it triggers. Each live
// screenshot gets a sidecar, .out/<name>.live.json (capture time, settings). --reuse-live
// reuses the screenshot instead of loading live again, unless the sidecar is missing, its
// settings differ from this run's, or it is older than LIVE_MAX_AGE_DAYS; the page then loads
// live afresh.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { PAGES, SHARED_WITH_LIVE } from './pages.mjs';
import { diffRegions, reuseProblem, obsoleteShared, TEXT_FAMILIES } from './lib.mjs';

const sharedWithLive = text => SHARED_WITH_LIVE.find(k => !k.echo && k.re.test(text));

const OUT = new URL('./.out/', import.meta.url).pathname;
const NODE_BASE = (process.env.NODE_BASE || 'http://127.0.0.1:3101').replace(/\/$/, '');
const LIVE_BASE = (process.env.LIVE_BASE || 'https://scripture.guide').replace(/\/$/, '');
const PIXEL_THRESHOLD = Number(process.env.PIXEL_THRESHOLD ?? 0.001);
const REGION_MAX_PIXELS = Number(process.env.REGION_MAX_PIXELS ?? 100);
const REGION_GAP = Number(process.env.REGION_GAP ?? 2);
const LIVE_MAX_AGE_DAYS = Number(process.env.LIVE_MAX_AGE_DAYS ?? 7);
const FONT_CHECK_BASE = process.env.FONT_CHECK_BASE?.replace(/\/$/, '');
const VIEWPORT = { width: 1280, height: 900 };

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const only = opt('--only');
const reuseLive = args.includes('--reuse-live');
const FONT_MODE = opt('--font-mode') || process.env.FONT_MODE || 'normalize';
if (!['normalize', 'native'].includes(FONT_MODE)) throw new Error(`FONT_MODE ${FONT_MODE}: normalize or native`);

const NORMALIZE_FAMILY = 'SG Smoke Normalized Text';
const NORMALIZE_STACK = `'${NORMALIZE_FAMILY}', Georgia, serif`;
// Saved with each live screenshot; bump when the normalization changes, so old captures are not reused.
const NORMALIZE_ID = FONT_MODE === 'normalize' ? 'unique-family-v2' : null;
const NORMALIZE_CSS = `
@font-face { font-family: '${NORMALIZE_FAMILY}'; src: url('/css/webfont/SortsMillGoudy-Regular.woff') format('woff'); font-weight: 400; font-style: normal; }
@font-face { font-family: '${NORMALIZE_FAMILY}'; src: url('/css/webfont/SortsMillGoudy-Italic.woff') format('woff'); font-weight: 400; font-style: italic; }`;

mkdirSync(OUT, { recursive: true });

// Restyles body, and any .verse whose own font-family starts with a text family, to the
// normalized stack. Returns how many elements changed.
async function normalizeFonts(page) {
  const changed = await page.evaluate(({ families, stack }) => {
    let n = 0;
    for (const el of [document.body, ...document.querySelectorAll('.verse')]) {
      if (!el) continue;
      const first = getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
      if (families.includes(first)) { el.style.setProperty('font-family', stack, 'important'); n++; }
    }
    return n;
  }, { families: TEXT_FAMILIES, stack: NORMALIZE_STACK });
  await page.evaluate(async family => {
    await Promise.all([document.fonts.load(`16px '${family}'`), document.fonts.load(`italic 16px '${family}'`)]);
  }, NORMALIZE_FAMILY);
  return changed;
}

// Returns notes about anything that did not settle.
async function settle(page) {
  const notes = [];
  if (FONT_MODE === 'normalize') {
    const changed = await normalizeFonts(page);
    if (!changed) notes.push('normalize: body is not in a text family; nothing restyled');
  }
  await page.evaluate(() => document.fonts.ready);
  // main.js fades headings and buttons in with jQuery; wait for them to finish.
  await page.waitForFunction(() => !window.jQuery || window.jQuery(':animated').length === 0, null, { timeout: 10000 })
    .catch(() => notes.push('jQuery :animated still running after 10s; screenshot taken anyway'));
  await page.waitForTimeout(300);
  return notes;
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
  const notes = await settle(page);
  return { page, problems, notes, status: res?.status() };
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
  if (a.width !== b.width || a.height !== b.height) return { ratio: 1, regions: [], note: `size ${a.width}x${a.height} vs ${b.width}x${b.height}` };
  const diff = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
  writeFileSync(diffFile, PNG.sync.write(diff));
  return { ratio: n / (a.width * a.height), regions: diffRegions(diff.data, a.width, a.height, { gap: REGION_GAP }) };
}

const box = r => `${r.w}x${r.h} at ${r.x},${r.y}`;

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

// --- live screenshot, fresh or reused ------------------------------------------------------

const readJson = file => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };

// Live's problems confirm SHARED_WITH_LIVE entries; seenOnLive collects them over the run.
const seenOnLive = new Set();
const hitOnNode = new Set();
const confirmOnLive = problems => { for (const p of problems) { const k = sharedWithLive(p); if (k) seenOnLive.add(k); } };

async function liveScreenshot(context, p, files) {
  const settings = { liveBase: LIVE_BASE, path: p.path, fontMode: FONT_MODE, normalize: NORMALIZE_ID, mask: p.mask || [], viewport: VIEWPORT };
  const info = { reused: false };
  if (reuseLive) {
    const sidecar = existsSync(files.live) ? readJson(files.liveMeta) : null;
    const why = existsSync(files.live) ? reuseProblem(sidecar, settings, Date.now(), LIVE_MAX_AGE_DAYS * 86400e3) : 'no screenshot';
    if (!why) return { png: readFileSync(files.live), info: { reused: true, capturedAt: sidecar.capturedAt }, notes: [`live reused (captured ${sidecar.capturedAt})`] };
    info.reloadedBecause = why;
  }
  const notes = info.reloadedBecause ? [`live reloaded: ${info.reloadedBecause}`] : [];
  const live = await open(context, LIVE_BASE + p.path);
  try {
    if (live.status >= 400) notes.push(`live HTTP ${live.status}`);
    notes.push(...live.notes.map(n => `live ${n}`));
    const png = await screenshot(live.page, files.live, p.mask);
    info.capturedAt = new Date().toISOString();
    writeFileSync(files.liveMeta, JSON.stringify({ ...settings, capturedAt: info.capturedAt }, null, 2));
    // Entries triggered by an interaction need it on live too; once a run is enough.
    for (const name of p.interact || []) {
      if (!SHARED_WITH_LIVE.some(k => k.trigger === name && !seenOnLive.has(k))) continue;
      try { notes.push(`live ${name}: ${await INTERACTIONS[name](live.page)}`); }
      catch (e) { notes.push(`live ${name}: ${e.message.split('\n')[0]}`); }
      await live.page.waitForTimeout(500);
    }
    confirmOnLive(live.problems);
    info.problems = live.problems;
    return { png, info, notes };
  } finally { await live.page.close(); }
}

// --- run ---------------------------------------------------------------------------------------

const report = {
  startedAt: new Date().toISOString(),
  complete: false,
  error: null,
  NODE_BASE, LIVE_BASE, FONT_MODE, PIXEL_THRESHOLD, REGION_MAX_PIXELS, REGION_GAP, LIVE_MAX_AGE_DAYS, reuseLive,
  rows: [],
  fonts: [],
  obsoleteShared: [],
};
const writeReport = () => writeFileSync(`${OUT}report.json`, JSON.stringify(report, null, 2));

let failures = 0;
let browser;
const pages = PAGES.filter(p => !only || p.name === only || p.path === only);

try {
  if (!pages.length) throw new Error(`no page matches ${only}`);
  browser = await chromium.launch();
  const contextOptions = { viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: 'light', locale: 'en-US', timezoneId: 'UTC' };
  const liveContext = await browser.newContext(contextOptions);
  const nodeContext = await browser.newContext({ ...contextOptions, permissions: ['clipboard-read', 'clipboard-write'] });
  await nodeContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: NODE_BASE });

  console.log(`live ${LIVE_BASE}  node ${NODE_BASE}  font-mode ${FONT_MODE}  fail above ${(PIXEL_THRESHOLD * 100).toFixed(2)}% or a region above ${REGION_MAX_PIXELS}px\n`);

  for (const p of pages) {
    const fails = [];
    const notes = [];
    const files = {
      live: `${OUT}${p.name}.live.png`, liveMeta: `${OUT}${p.name}.live.json`,
      node: `${OUT}${p.name}.node.png`, diff: `${OUT}${p.name}.diff.png`,
    };
    const row = { name: p.name, path: p.path, ratio: null, largestRegion: null, regions: [], live: null, fails, notes };
    report.rows.push(row);

    let livePng;
    try {
      const live = await liveScreenshot(liveContext, p, files);
      livePng = live.png;
      row.live = live.info;
      notes.push(...live.notes);
    } catch (e) { fails.push(`live: ${e.message.split('\n')[0]}`); }

    try {
      const node = await open(nodeContext, NODE_BASE + p.path);
      if (node.status >= 400) fails.push(`node HTTP ${node.status}`);
      notes.push(...node.notes.map(n => `node ${n}`));
      const nodePng = await screenshot(node.page, files.node, p.mask);
      if (livePng) {
        const c = compare(livePng, nodePng, files.diff);
        row.ratio = c.ratio;
        row.largestRegion = c.regions[0]?.pixels ?? 0;
        // Every region over the limit, and the largest few for context.
        row.regions = c.regions.filter((r, i) => i < 5 || r.pixels > REGION_MAX_PIXELS);
        if (c.note) notes.push(c.note);
        if (c.ratio > PIXEL_THRESHOLD) fails.push(`pixels ${(c.ratio * 100).toFixed(3)}% differ`);
        for (const r of c.regions.filter(r => r.pixels > REGION_MAX_PIXELS)) fails.push(`region of ${r.pixels}px, ${box(r)}`);
      }
      for (const name of p.interact || []) {
        try { notes.push(`${name}: ${await INTERACTIONS[name](node.page)}`); }
        catch (e) { fails.push(`${name}: ${e.message.split('\n')[0]}`); }
      }
      await node.page.waitForTimeout(500); // late requests from the interactions
      // Problems live has too are listed, not failed; a URL-less console echo only when such a problem explains it.
      const known = node.problems.filter(sharedWithLive);
      for (const k of known) hitOnNode.add(sharedWithLive(k));
      for (const problem of node.problems) {
        const echo = SHARED_WITH_LIVE.find(k => k.echo && k.re.test(problem));
        if (sharedWithLive(problem) || (echo && known.length)) notes.push(`shared with live: ${problem}`);
        else fails.push(problem);
      }
      await node.page.close();
    } catch (e) { fails.push(`node: ${e.message.split('\n')[0]}`); }

    const pct = row.ratio == null ? '    n/a' : `${(row.ratio * 100).toFixed(3).padStart(6)}%`;
    const region = row.largestRegion == null ? '' : `  max region ${String(row.largestRegion).padStart(4)}px`;
    console.log(`${fails.length ? 'FAIL' : 'ok  '} ${pct}${region}  ${p.path}`);
    for (const n of notes) console.log(`        ${n}`);
    for (const f of fails) console.log(`     !  ${f}`);
    if (fails.length) failures++;
    writeReport();
  }

  // SHARED_WITH_LIVE entries live no longer shows (judged only on fresh live loads).
  if (!reuseLive) {
    for (const k of obsoleteShared(SHARED_WITH_LIVE, hitOnNode, seenOnLive)) {
      report.obsoleteShared.push({ re: String(k.re), why: k.why });
      console.log(`\nwarn SHARED_WITH_LIVE ${k.re} excused a Node problem but no live load showed it: obsolete? (${k.why})`);
    }
  }

  // The private font: on NODE_BASE when it serves it, and on FONT_CHECK_BASE when given.
  for (const base of [NODE_BASE, FONT_CHECK_BASE].filter(Boolean)) {
    const ctx = await browser.newContext(contextOptions);
    try {
      const r = await fontCheck(ctx, base);
      const required = base === FONT_CHECK_BASE;
      report.fonts.push({ base, required, ...r });
      if (r.ok === null && !required) { console.log(`\nfont  ${base}: ${r.detail}`); continue; }
      const ok = r.ok === true;
      console.log(`\n${ok ? 'ok  ' : 'FAIL'} font ${base}: ${r.detail}`);
      if (!ok) failures++;
    } finally { await ctx.close(); }
  }
  report.complete = true;
} catch (e) {
  report.error = e.stack || String(e);
  failures++;
  console.error(`\nrun stopped: ${e.stack || e}`);
} finally {
  report.finishedAt = new Date().toISOString();
  writeReport();
  await browser?.close();
}

const passed = report.rows.filter(r => !r.fails.length).length;
console.log(`\n${passed}/${pages.length} pages pass${report.complete ? '' : ' (run incomplete)'}; images in ${OUT}`);
process.exit(failures ? 1 : 0);
