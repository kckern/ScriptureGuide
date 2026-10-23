import { test, expect } from 'vitest';
import ejs from 'ejs';
import { fileURLToPath } from 'node:url';

const HOME = fileURLToPath(new URL('../../src/presentation/views/home.ejs', import.meta.url));

// home.php's a.button rule, declaration for declaration. font-size:24 has no unit on live; the
// page renders in quirks mode (no doctype), where a unitless length is read as px.
const LIVE_BUTTON = [
  'position:relative', 'bottom:-40px', 'font-size:24', 'font-weight:bold', 'height:36px', 'float:right',
  'outline:1px solid black', 'background-color:#555', 'color:#FFF', 'text-decoration:none',
  'padding-left:1em', 'padding-right:1em', 'right:0em',
];

test('the Install Now button is styled as on live (home.php a.button)', async () => {
  const html = await ejs.renderFile(HOME, { config: {} });
  const rule = html.match(/a\.button\s*\{([^}]*)\}/);
  expect(rule).not.toBeNull();
  const decls = rule[1].replace(/\/\*[\s\S]*?\*\//g, '').split(';').map(d => d.replace(/\s+/g, ' ').trim().replace(/\s*:\s*/, ':')).filter(Boolean);
  expect(decls).toEqual(LIVE_BUTTON);
});

// A search can take seconds; the box must react the moment Enter is pressed (checked in Chromium
// by hand: class, readonly and progress cursor are set before the next page loads).
test('the search box shows it is searching on Enter and recovers on Back', async () => {
  const html = await ejs.renderFile(HOME, { config: {} });
  expect(html).toMatch(/input\.searching\s*\{[^}]*animation:\s*searching/);
  expect(html).toContain('$("#searchbox").addClass("searching").prop("readonly", true);');
  expect(html).toMatch(/hasClass\("searching"\) \|\| !term\.trim\(\)\) return false;/);
  expect(html).toMatch(/on\("pageshow"[\s\S]*removeClass\("searching"\)/);
});
