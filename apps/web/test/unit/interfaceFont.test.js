import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test, expect } from 'vitest';

// Scripture text is Goudy Scripture; interface text and reference labels are Roboto Condensed.
const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.resolve(here, '../../public');
const css = name => readFileSync(path.join(pub, 'css', name), 'utf8');
const UI = "font-family: 'Roboto Condensed', 'Arial Narrow', sans-serif;";
const rule = (sheet, selector) => {
  const at = sheet.indexOf(selector);
  expect(at, `${selector} not found`).toBeGreaterThan(-1);
  return sheet.slice(at, sheet.indexOf('}', at));
};

describe('Roboto Condensed (interface text)', () => {
  test('style.css declares regular and bold from /css/webfont, and the files exist', () => {
    const style = css('style.css');
    for (const [weight, file] of [['400', 'RobotoCondensed-Regular.woff2'], ['700', 'RobotoCondensed-Bold.woff2']]) {
      expect(style).toMatch(new RegExp(`font-family: 'Roboto Condensed';[^}]*font-weight: ${weight};[^}]*/css/webfont/${file}`));
      expect(existsSync(path.join(pub, 'css/webfont', file))).toBe(true);
    }
  });

  test.each([
    ['ui.css', '#toolbar'],
    ['ui.css', 'ul.tabs {'],
    ['ui.css', '.tipsy {'],
  ])('%s %s uses it', (sheet, selector) => {
    expect(rule(css(sheet), selector)).toContain(UI);
  });

  test('the home search box uses it, and its examples are in curly quotes', () => {
    const home = readFileSync(path.resolve(here, '../../src/presentation/views/home.ejs'), 'utf8');
    expect(home).toContain(UI);
    expect(home).toContain('e.g. \\u2018" + examples[pointer] + "\\u2019"');
  });
});

// References to scripture use the scripture font, even inside interface chrome.
describe('references use Goudy Scripture', () => {
  const GS = "font-family: 'Goudy Scripture', 'Sorts Mill Goudy', Georgia, serif;";
  test.each([
    ['style.css', ' h4 {'],
    ['style.css', '.refblock'],
    ['style.css', '#status_msg .sref'],
    ['parallel.css', '.parallel td.ref a'],
  ])('%s %s', (sheet, selector) => {
    expect(rule(css(sheet), selector)).toContain(GS);
  });

  test('main.js wraps the toolbar reference so it takes the scripture font', () => {
    const main = readFileSync(path.join(pub, 'js/main.js'), 'utf8');
    expect(main).toContain("<span class='sref'>\"+$(this).attr(\"ref\")+\"</span>");
  });
});

