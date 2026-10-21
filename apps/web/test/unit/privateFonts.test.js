import { describe, test, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import ejs from 'ejs';
import * as cheerio from 'cheerio';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fontsFromEnv } from '../../src/config/index.js';
import { goudyFontFace } from '../../src/presentation/fontFaces.js';
import { privateFonts } from '../../src/app/middleware/static.js';

const LAYOUT = fileURLToPath(new URL('../../src/presentation/views/layouts/main.ejs', import.meta.url));
const STYLE = readFileSync(new URL('../../public/css/style.css', import.meta.url), 'utf8');

const render = locals => ejs.renderFile(LAYOUT, { body: '<div id="container"></div>', config: {}, ...locals });

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
});

describe('goudyFontFace', () => {
  test('no base: no @font-face', () => {
    expect(goudyFontFace({ base: '', goudyFile: 'scripture.woff2' })).toBe('');
  });
  test('declares Goudy, 400 upright, swap, from base/file', () => {
    const css = goudyFontFace({ base: '/private-fonts', goudyFile: 'scripture.woff2' });
    expect(css).toContain("font-family: 'Goudy'");
    expect(css).toContain("src: url('/private-fonts/scripture.woff2') format('woff2')");
    expect(css).toContain('font-weight: 400');
    expect(css).toContain('font-style: normal');
    expect(css).toContain('font-display: swap');
  });
  test('format follows the extension', () => {
    expect(goudyFontFace({ base: '/f', goudyFile: 'g.woff' })).toContain("format('woff')");
  });
  test('refuses a base or file name that would break out of url()', () => {
    expect(() => goudyFontFace({ base: "/f')}", goudyFile: 'g.woff2' })).toThrow();
    expect(() => goudyFontFace({ base: '/f', goudyFile: 'a b.woff2' })).toThrow();
    expect(() => goudyFontFace({ base: '/f', goudyFile: '</style>.woff2' })).toThrow();
  });
});

describe('layout', () => {
  test('without a private font: no Goudy @font-face', async () => {
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
  test("body stack puts the private 'Goudy' first, Sorts Mill Goudy as the fallback", () => {
    expect(STYLE).toContain("font-family: 'Goudy', 'Sorts Mill Goudy', Georgia, serif;");
  });
});

describe('privateFonts', () => {
  test('no FONT_DIR: no /private-fonts route', async () => {
    const res = await request(express().use(privateFonts(''))).get('/private-fonts/scripture.woff2');
    expect(res.status).toBe(404);
  });
  test('FONT_DIR: serves its files at /private-fonts as font/woff2', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sg-fonts-'));
    writeFileSync(path.join(dir, 'scripture.woff2'), 'not a font');
    const res = await request(express().use(privateFonts(dir))).get('/private-fonts/scripture.woff2');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('font/woff2');
    expect(res.body.toString()).toBe('not a font');
  });
  test('FONT_DIR: nothing outside /private-fonts, no directory listing', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sg-fonts-'));
    writeFileSync(path.join(dir, 'scripture.woff2'), 'x');
    const app = express().use(privateFonts(dir));
    expect((await request(app).get('/scripture.woff2')).status).toBe(404);
    expect((await request(app).get('/private-fonts/')).status).toBe(404);
  });
});
