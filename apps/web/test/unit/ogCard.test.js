import { describe, test, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import ejs from 'ejs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Verse } from '../../src/domain/entities/Verse.js';
import { Reference } from '../../src/domain/entities/Reference.js';
import { ScriptureResult } from '../../src/domain/entities/ScriptureResult.js';

// No database: every query answers with no rows. The lookup itself is stubbed per test.
vi.mock('../../src/data/db/connection.js', () => ({ default: { query: async () => [] } }));
// No network: edition badges are fetched from media.scripture.guide; here every fetch fails.
vi.stubGlobal('fetch', async () => ({ ok: false, status: 404 }));

const { createApp } = await import('../../src/app/createApp.js');
const { default: lookupService } = await import('../../src/services/ScriptureLookupService.js');
const { HtmlPresenter } = await import('../../src/presentation/presenters/HtmlPresenter.js');
const { fitLines, cardContent, renderCard, ogFonts } = await import('../../src/presentation/og/ogCard.js');
const { ogCache } = await import('../../src/presentation/presenters/formats/og.js');

const app = createApp({ log: false });

const NEPHI_5_3 = 'And after this manner of language had my mother complained against my father.';
const SUMMARY = 'Sariah complains against Lehi—Both rejoice over the return of their sons—They offer sacrifices.';

function nephi({ subChapter = true, text = NEPHI_5_3 } = {}) {
  return new ScriptureResult({
    reference: new Reference({ query: '1 Nephi 5:3', normalized: '1 Nephi 5:3', verseIds: [3] }),
    verses: [new Verse({ id: 3, chapter: 5, verseNum: 3, text, version: 'LDS' })],
    chapterHeading: { summary: SUMMARY },
    config: { version: 'LDS', _subChapter: subChapter },
  });
}

const empty = () => new ScriptureResult({
  reference: new Reference({ query: 'zzz 99', normalized: '', verseIds: [] }),
  verses: [],
  config: {},
});

// Width and height from the PNG IHDR chunk.
function pngSize(buf) {
  expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const png = req => req.buffer(true).parse((res, cb) => {
  const chunks = [];
  res.on('data', c => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
});

beforeEach(() => {
  vi.restoreAllMocks();
  ogCache.clear();
});

describe('GET /og/<path>.png', () => {
  test('a verse answers a 1200×630 PNG, cached a day', async () => {
    vi.spyOn(lookupService, 'lookup').mockResolvedValue(nephi());
    const res = await png(request(app).get('/og/lds/1.ne.5.3.png').set('Host', 'scripture.guide'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
    expect(pngSize(res.body)).toEqual({ width: 1200, height: 630 });
    // the same lookup the page /lds/1.ne.5.3 does
    expect(lookupService.lookup.mock.calls[0][0]).toBe('1.ne.5.3');
    expect(lookupService.lookup.mock.calls[0][1].version).toBe('LDS');
  });

  test('a second request for the same card comes from the cache', async () => {
    const spy = vi.spyOn(lookupService, 'lookup').mockResolvedValue(nephi());
    const a = await png(request(app).get('/og/kjv/john.3.16.png'));
    const b = await png(request(app).get('/og/kjv/john.3.16.png'));
    expect(b.body.equals(a.body)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('/og/site.png is the site card', async () => {
    const res = await png(request(app).get('/og/site.png'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
    expect(pngSize(res.body)).toEqual({ width: 1200, height: 630 });
  });

  test('an unknown reference, a failed lookup and a search answer the site card', async () => {
    const site = (await png(request(app).get('/og/site.png'))).body;
    vi.spyOn(lookupService, 'lookup').mockResolvedValue(empty());
    const unknown = await png(request(app).get('/og/kjv/zzz.99.png'));
    expect(unknown.status).toBe(200);
    expect(unknown.body.equals(site)).toBe(true);

    lookupService.lookup.mockRejectedValue(new Error('db down'));
    const failed = await png(request(app).get('/og/kjv/john.3.17.png'));
    expect(failed.status).toBe(200);
    expect(failed.body.equals(site)).toBe(true);

    const search = await png(request(app).get('/og/search/faith.png'));
    expect(search.status).toBe(200);
    expect(search.body.equals(site)).toBe(true);
  });

  test('Korean text, which Goudy Scripture lacks, does not fail', async () => {
    vi.spyOn(lookupService, 'lookup').mockResolvedValue(nephi({ text: '이와 같은 말로 나의 어머니가 나의 아버지에게 불평하였느니라.' }));
    const res = await png(request(app).get('/og/krbom/1.ne.5.3.png'));
    expect(res.status).toBe(200);
    expect(pngSize(res.body)).toEqual({ width: 1200, height: 630 });
  });
});

describe('card content', () => {
  test('a verse shows its own text, without the markup of the text format', () => {
    const result = nephi({ text: '§¶And after this ｟manner｠ of language.' });
    const data = new HtmlPresenter().serialize(result);
    const card = cardContent(result, data, '1 Nephi 5:3');
    expect(card.title).toBe('1 Nephi 5:3');
    expect(card.body).toBe('And after this manner of language.');
    // the edition badge og:image used (versionImg: an LDS Old Testament verse → ldskjv)
    expect(card.badge).toBe(data.img);
    expect(card.badge).toBe('ldskjv');
  });

  test('a whole chapter shows its summary', () => {
    const result = nephi({ subChapter: false });
    const card = cardContent(result, {}, '1 Nephi 5');
    expect(card.body).toBe(SUMMARY);
  });

  test('a whole chapter without a summary shows its first verses', () => {
    const result = nephi({ subChapter: false });
    result.chapterHeading = null;
    expect(cardContent(result, {}, '1 Nephi 5').body).toBe(NEPHI_5_3);
  });
});

describe('fitLines', () => {
  const { goudy } = ogFonts();
  test('short text fits on one line untouched', () => {
    expect(fitLines('In the beginning.', goudy, 36, 1000, 4)).toEqual({ lines: ['In the beginning.'], truncated: false });
  });

  test('long text stops at a word boundary and ends with an ellipsis', () => {
    const text = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');
    const { lines, truncated } = fitLines(text, goudy, 36, 1000, 4);
    expect(truncated).toBe(true);
    expect(lines).toHaveLength(4);
    expect(lines[3].endsWith('…')).toBe(true);
    // every line is whole words
    for (const line of lines) {
      for (const w of line.replace(/…$/, '').split(' ')) expect(w).toMatch(/^word\d+$/);
      expect(goudy.getAdvanceWidth(line, 36)).toBeLessThanOrEqual(1000);
    }
  });
});

describe('renderCard', () => {
  test('a very long title and body render within a second', async () => {
    const t0 = performance.now();
    const buf = await renderCard({ title: 'The Testimony of Three Witnesses and of Eight Witnesses 1:1–40', body: 'And '.repeat(400), badge: null });
    expect(pngSize(buf)).toEqual({ width: 1200, height: 630 });
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe('link-preview tags', () => {
  test('og:image is the generated card for the page path', () => {
    const req = { headers: { host: 'scripture.guide' }, path: '/lds/1.ne.5.3' };
    const meta = new HtmlPresenter()._buildOgMeta(nephi(), {}, '1 Nephi 5:3', req);
    expect(meta.image).toBe('https://scripture.guide/og/lds/1.ne.5.3.png');
  });

  test('the layout declares a 1200×630 PNG and a large Twitter card', async () => {
    const layout = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src/presentation/views/layouts/main.ejs');
    const html = await ejs.renderFile(layout, {
      body: '', config: {}, title: '1 Nephi 5:3',
      ogMeta: { title: '1 Nephi 5:3 | Scripture Guide', image: 'https://scripture.guide/og/lds/1.ne.5.3.png', description: 'And after', url: 'https://scripture.guide/lds/1.ne.5.3' },
    });
    const tag = (attr, name) => html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`))?.[1];
    expect(tag('property', 'og:image')).toBe('https://scripture.guide/og/lds/1.ne.5.3.png');
    expect(tag('property', 'og:image:width')).toBe('1200');
    expect(tag('property', 'og:image:height')).toBe('630');
    expect(tag('property', 'og:image:type')).toBe('image/png');
    expect(tag('name', 'twitter:card')).toBe('summary_large_image');
    expect(tag('name', 'twitter:image')).toBe('https://scripture.guide/og/lds/1.ne.5.3.png');
    expect(tag('name', 'twitter:title')).toBe('1 Nephi 5:3 | Scripture Guide');
    expect(tag('name', 'twitter:description')).toBe('And after');
  });

  test('a passage page carries them', async () => {
    vi.spyOn(lookupService, 'lookup').mockResolvedValue(nephi());
    const res = await request(app).get('/lds/1.ne.5.3').set('Host', 'scripture.guide');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<meta property="og:image" content="https://scripture.guide/og/lds/1.ne.5.3.png" />');
    expect(res.text).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });

  test('search pages use the site card', async () => {
    const res = await request(app).get('/search/faith').set('Host', 'scripture.guide');
    expect(res.text).toContain('<meta property="og:image" content="https://scripture.guide/og/site.png" />');
  });
});
