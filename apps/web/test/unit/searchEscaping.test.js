import { describe, test, expect } from 'vitest';
import ejs from 'ejs';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'node:url';

// The search term comes from the URL. PHP echoed it raw (search.php: searchterm = "<?=$query?>",
// and into the page). The parity normalizer reads the term back out of the live page
// (rawSearchterm), so it cannot catch an escaping regression here: this test does.
const VIEW = fileURLToPath(new URL('../../src/presentation/views/search.ejs', import.meta.url));
const PAYLOADS = ['"><svg onload=alert(1)>', "'-alert(document.domain)-'", '</script><script>alert(2)</script>', "'><img src=x onerror=alert(3)>"];

const render = query => ejs.renderFile(VIEW, { query, count: 0, vols: [], rows: [], config: {}, slugref: query, ogUrl: '' });

describe('search view escapes the search term', () => {
  test.each(PAYLOADS)('%s', async payload => {
    const html = await render(payload);
    const $ = cheerio.load(html);
    expect($('svg, img[src=x]').length).toBe(0);
    expect(html).not.toContain('<script>alert(2)');
    // The heading shows the term as text
    expect($('#container h1 em').text()).toBe(`“${payload}”`);
    // searchterm stays one JS string holding the term
    const line = $('#container script').text().split('\n').find(l => l.startsWith('searchterm ='));
    expect(JSON.parse(line.replace(/^searchterm = /, '').replace(/;$/, ''))).toBe(payload);
  });
});
