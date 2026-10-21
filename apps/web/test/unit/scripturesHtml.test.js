import { describe, test, expect } from 'vitest';
import { scripturesHtml } from '../../src/presentation/legacy/passages.js';

// The api "output" HTML. A block's orig echoes the request: PHP printed it raw (reflected XSS).
describe('scripturesHtml: a not-found block', () => {
  test('its heading is escaped', async () => {
    const { html } = await scripturesHtml({}, {}, [{ orig: '<img src=x onerror=alert(1)>', book: 'X', verse_ids: [] }], null);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
  test('plain text is unchanged', async () => {
    const { html } = await scripturesHtml({}, {}, [{ orig: 'Blog', book: 'Blog', verse_ids: [] }], null);
    expect(html).toContain('<h3>\n\t\t\tBlog\n\t\t\t</h3>');
  });
});
