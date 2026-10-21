import { describe, test, expect } from 'vitest';
import ejs from 'ejs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LAYOUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src/presentation/views/layouts/main.ejs');
const render = locals => ejs.renderFile(LAYOUT, { body: '<div id="container"></div>', config: {}, ...locals });
const scriptLine = (html, name) => html.split('\n').find(l => l.includes(`${name} =`));

// The version and reference come from the URL: they must stay inside their JS strings.
describe('layout: slugver and slugref are JS-escaped', () => {
  test('quotes cannot end the string', async () => {
    const html = await render({ slugver: '"||alert(1)||"', slugref: '"||alert(2)||"' });
    expect(scriptLine(html, 'var slugver')).toBe('var slugver = "/\\"||alert(1)||\\"";');
    expect(scriptLine(html, 'slugref')).toBe('slugref = "\\"||alert(2)||\\"";');
  });
  test('a closing script tag cannot end the block', async () => {
    const html = await render({ slugver: 'x', slugref: '</script><script>alert(3)' });
    expect(html).not.toContain('</script><script>alert(3)');
  });
  test('ordinary values are unchanged', async () => {
    const html = await render({ slugver: 'KJV', slugref: 'john.3.16' });
    expect(scriptLine(html, 'var slugver')).toBe('var slugver = "/kjv";');
    expect(scriptLine(html, 'slugref')).toBe('slugref = "john.3.16";');
  });
});

describe('error view escapes the message and stack', () => {
  test('a message carrying markup stays text', async () => {
    const view = path.join(path.dirname(LAYOUT), '../error.ejs');
    const html = await ejs.renderFile(view, { message: 'URI malformed: <zzx>', status: 400, stack: 'at <zzy>', config: {} });
    expect(html).not.toMatch(/<zz[xy]>/);
    expect(html).toContain('URI malformed: &lt;zzx&gt;');
  });
});
