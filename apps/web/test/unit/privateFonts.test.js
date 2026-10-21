import { describe, test, expect, vi, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import ejs from 'ejs';
import * as cheerio from 'cheerio';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fontsFromEnv } from '../../src/config/index.js';
import { goudyFontFace, privateFontCss } from '../../src/presentation/fontFaces.js';
import { privateFonts, installPrivateFonts } from '../../src/app/middleware/static.js';

const VIEWS = fileURLToPath(new URL('../../src/presentation/views', import.meta.url));
const LAYOUT = path.join(VIEWS, 'layouts/main.ejs');
const STYLE = readFileSync(new URL('../../public/css/style.css', import.meta.url), 'utf8');

const render = locals => ejs.renderFile(LAYOUT, { body: '<div id="container"></div>', config: {}, ...locals });

// Temporary font directories holding a dummy file (never a real font); removed after the run.
const dirs = [];
function fontDir(files = { 'scripture.woff2': 'not a font' }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'sg-fonts-'));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files)) writeFileSync(path.join(dir, name), body);
  return dir;
}
afterAll(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })));

describe('fontsFromEnv', () => {
  test('nothing set: no private font', () => {
    expect(fontsFromEnv({})).toEqual({ base: '', dir: '', goudyFile: 'scripture.woff2' });
  });
  test('FONT_BASE without its trailing slash', () => {
    expect(fontsFromEnv({ FONT_BASE: 'https://media.scripture.guide/fonts/' }).base).toBe('https://media.scripture.guide/fonts');
  });
  test('FONT_DIR alone: served and referenced at /private-fonts', () => {
    expect(fontsFromEnv({ FONT_DIR: '/srv/fonts' })).toEqual({ base: '/private-fonts', dir: '/srv/fonts', goudyFile: 'scripture.woff2' });
  });
  test('FONT_BASE wins over the FONT_DIR default; FONT_GOUDY_FILE renames the file', () => {
    const f = fontsFromEnv({ FONT_DIR: '/srv/fonts', FONT_BASE: '/f', FONT_GOUDY_FILE: 'goudy.woff' });
    expect(f).toEqual({ base: '/f', dir: '/srv/fonts', goudyFile: 'goudy.woff' });
  });
  test('FONT_BASE that is empty without its slashes: warned about and ignored', () => {
    const warn = vi.fn();
    expect(fontsFromEnv({ FONT_BASE: '/' }, warn).base).toBe('');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('FONT_BASE'));
    expect(fontsFromEnv({ FONT_BASE: '//', FONT_DIR: '/srv/fonts' }, () => {}).base).toBe('/private-fonts');
  });
  test('no warning for a usable FONT_BASE', () => {
    const warn = vi.fn();
    fontsFromEnv({ FONT_BASE: '/f' }, warn);
    fontsFromEnv({}, warn);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('goudyFontFace', () => {
  const css = goudyFontFace({ base: '/private-fonts', goudyFile: 'scripture.woff2' });
  const faces = css.split('@font-face').slice(1);

  test('no base: no @font-face', () => {
    expect(goudyFontFace({ base: '', goudyFile: 'scripture.woff2' })).toBe('');
  });
  test('upright face: Goudy Scripture, 400, swap, from base/file', () => {
    const upright = faces.find(f => f.includes('font-style: normal'));
    expect(upright).toContain("font-family: 'Goudy Scripture'");
    expect(upright).toContain("src: url('/private-fonts/scripture.woff2') format('woff2')");
    expect(upright).toContain('font-weight: 400');
    expect(upright).toContain('font-display: swap');
  });
  test('italic face: the same family from Sorts Mill Goudy Italic (a real italic, not a synthesized one)', () => {
    const italic = faces.find(f => f.includes('font-style: italic'));
    expect(italic).toContain("font-family: 'Goudy Scripture'");
    expect(italic).toContain("src: url('/css/webfont/SortsMillGoudy-Italic.woff') format('woff')");
    expect(italic).toContain('font-weight: 400');
    expect(italic).toContain('font-display: swap');
  });
  test('exactly the two faces', () => {
    expect(faces).toHaveLength(2);
  });
  test('format follows the extension', () => {
    expect(goudyFontFace({ base: '/f', goudyFile: 'g.woff' })).toContain("url('/f/g.woff') format('woff')");
  });
  test('refuses a base or file name that would break out of url()', () => {
    expect(() => goudyFontFace({ base: "/f')}", goudyFile: 'g.woff2' })).toThrow();
    expect(() => goudyFontFace({ base: '/f', goudyFile: 'a b.woff2' })).toThrow();
    expect(() => goudyFontFace({ base: '/f', goudyFile: '</style>.woff2' })).toThrow();
  });
});

describe('privateFontCss (startup check)', () => {
  test('FONT_DIR with the file: the @font-face, no warning', () => {
    const warn = vi.fn();
    const css = privateFontCss(fontsFromEnv({ FONT_DIR: fontDir() }), { warn });
    expect(css).toContain("url('/private-fonts/scripture.woff2')");
    expect(warn).not.toHaveBeenCalled();
  });
  test('FONT_DIR without the file: a warning and no @font-face (no 404s)', () => {
    const warn = vi.fn();
    expect(privateFontCss(fontsFromEnv({ FONT_DIR: fontDir({}) }), { warn })).toBe('');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('scripture.woff2'));
  });
  test('an external FONT_BASE is not checked against FONT_DIR', () => {
    const warn = vi.fn();
    const css = privateFontCss(fontsFromEnv({ FONT_DIR: fontDir({}), FONT_BASE: 'https://media.scripture.guide/fonts' }), { warn });
    expect(css).toContain("url('https://media.scripture.guide/fonts/scripture.woff2')");
    expect(warn).not.toHaveBeenCalled();
  });
  test('nothing configured: empty', () => {
    expect(privateFontCss(fontsFromEnv({}))).toBe('');
  });
});

describe('layout', () => {
  test('without a private font: no @font-face', async () => {
    const $ = cheerio.load(await render({}));
    expect($('head').html()).not.toMatch(/font-face/);
    expect($('style#private-fonts').length).toBe(0);
  });
  test('with a private font: the @font-face, after style.css, with the configured URL', async () => {
    const fontFaceCss = goudyFontFace({ base: 'https://media.scripture.guide/fonts', goudyFile: 'scripture.woff2' });
    const html = await render({ fontFaceCss });
    const $ = cheerio.load(html);
    expect($('style#private-fonts').text()).toContain("url('https://media.scripture.guide/fonts/scripture.woff2') format('woff2')");
    expect(html.indexOf('/css/style.css')).toBeLessThan(html.indexOf('id="private-fonts"'));
  });
});

describe('style.css', () => {
  test('ships no Goudy Old Style @font-face or file URL', () => {
    expect(STYLE).not.toMatch(/webfont\/Goudy-/);
    expect(STYLE).not.toMatch(/font-family:\s*'Goudy';/);
  });
  test("body stack puts the private 'Goudy Scripture' first, Sorts Mill Goudy as the fallback", () => {
    expect(STYLE).toContain("font-family: 'Goudy Scripture', 'Sorts Mill Goudy', Georgia, serif;");
    expect(STYLE).not.toMatch(/'Goudy'/);
  });
});

describe('privateFonts', () => {
  test('no FONT_DIR: no /private-fonts route', async () => {
    const res = await request(express().use(privateFonts(''))).get('/private-fonts/scripture.woff2');
    expect(res.status).toBe(404);
  });
  test('FONT_DIR: serves its files at /private-fonts as font/woff2, cached 30 days', async () => {
    const res = await request(express().use(privateFonts(fontDir()))).get('/private-fonts/scripture.woff2');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('font/woff2');
    expect(res.headers['cache-control']).toBe('public, max-age=2592000');
    expect(res.body.toString()).toBe('not a font');
  });
  test('FONT_DIR: nothing outside /private-fonts, no directory listing', async () => {
    const app = express().use(privateFonts(fontDir()));
    expect((await request(app).get('/scripture.woff2')).status).toBe(404);
    expect((await request(app).get('/private-fonts/')).status).toBe(404);
  });
});

describe('installPrivateFonts (app wiring)', () => {
  function appWith(env) {
    const app = express();
    app.set('view engine', 'ejs');
    app.set('views', VIEWS);
    installPrivateFonts(app, fontsFromEnv(env, () => {}), { warn: () => {} });
    app.get('/page', (req, res) => res.render('layouts/main', { body: '<div id="container"></div>', config: {} }));
    return app;
  }
  test('FONT_DIR: pages carry the @font-face and its URL serves the file', async () => {
    const app = appWith({ FONT_DIR: fontDir() });
    const $ = cheerio.load((await request(app).get('/page')).text);
    const url = $('style#private-fonts').text().match(/url\('([^']+\.woff2)'\)/)[1];
    expect(url).toBe('/private-fonts/scripture.woff2');
    const font = await request(app).get(url);
    expect(font.status).toBe(200);
    expect(font.headers['content-type']).toBe('font/woff2');
  });
  test('nothing set: no @font-face and no route', async () => {
    const app = appWith({});
    const $ = cheerio.load((await request(app).get('/page')).text);
    expect($('style#private-fonts').length).toBe(0);
    expect((await request(app).get('/private-fonts/scripture.woff2')).status).toBe(404);
  });
});
