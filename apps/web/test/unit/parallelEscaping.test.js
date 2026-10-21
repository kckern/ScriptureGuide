import { describe, test, expect } from 'vitest';
import ejs from 'ejs';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'node:url';

const VIEW = fileURLToPath(new URL('../../src/presentation/views/parallel.ejs', import.meta.url));

// A ParallelService page whose URL-derived fields (versions, slugs) carry an attack payload
function page(payload) {
  const v = 'kjv' + payload;
  return {
    title: `John 3:16 ~ John 3:16`,
    lver: v.toUpperCase(), rver: 'NRSV' + payload,
    limg: 'kjv', rimg: 'nrsv',
    leftheader: 'John 3:16', rightheader: 'John 3:16',
    htmlLeftheader: 'John 3:16' + payload, htmlRightheader: 'John 3:16',
    leftheaderSlug: 'john.3.16' + payload, rightheaderSlug: 'john.3.16',
    swapslug: `nrsv~${v}/john.3.16`, chslug: `${v}/john.3~nrsv/john.3`, fullslug: `${v}~nrsv/john.3.16`,
    ischapter: false,
    rows: [{
      id: 1, className: 'diffrow sidebyside',
      left: { verseId: 26137, ref: 'John 3:16' + payload, slug: 'john.3.16' + payload, text: 'For God so loved', fax: true },
      right: { verseId: 26137, ref: 'John 3:16', slug: 'john.3.16', text: 'For God so loved', fax: false },
    }],
    config: {}, ogUrl: '',
  };
}

const PAYLOADS = ['"><svg onload=alert(1)>', "'-alert(document.domain)-'", "</script><script>alert(2)</script>", "'><img src=x onerror=alert(3)>"];

describe('parallel view escapes request-derived values', () => {
  test.each(PAYLOADS)('%s', async payload => {
    const html = await ejs.renderFile(VIEW, page(payload));
    const $ = cheerio.load(html);
    expect($('svg, img[src=x]').length).toBe(0);
    expect(html).not.toContain('<script>alert(2)');
    // Each slug stays inside its single-quoted JS string
    const script = $('#container script').text();
    for (const name of ['fullslug', 'chslug', 'swapslug']) {
      const line = script.split('\n').find(l => l.startsWith(`var ${name} =`));
      expect(line).toMatch(/^var \w+ = '([^'\\]|\\.)*';$/);
    }
    expect(script).not.toMatch(/alert\(document\.domain\)-'/);
    // Values survive as text
    expect($('a.ref').first().text()).toBe('John 3:16' + payload);
    expect($('div.verse').first().attr('ref')).toBe('John 3:16' + payload);
  });

  test('ordinary values render as before', async () => {
    const html = await ejs.renderFile(VIEW, page(''));
    expect(html).toContain("var fullslug = 'kjv~nrsv/john.3.16';");
    expect(html).toContain('<a href="/nrsv~kjv/john.3.16">Switch ⇆ Sides</a>');
    expect(html).toContain('<a class="ref" href="/kjv/john.3.16">John 3:16</a>');
  });
});
