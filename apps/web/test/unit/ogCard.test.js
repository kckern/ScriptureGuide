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
// No network: edition badges are fetched from media.scripture.guide; here every badge is missing
// (404) unless a test says otherwise.
const missing = async () => ({ ok: false, status: 404, headers: new Headers() });
vi.stubGlobal('fetch', missing);

const { createApp } = await import('../../src/app/createApp.js');
const { default: lookupService } = await import('../../src/services/ScriptureLookupService.js');
const { HtmlPresenter } = await import('../../src/presentation/presenters/HtmlPresenter.js');
const { fitLines, fitBody, cardContent, renderCard, ogFonts } = await import('../../src/presentation/og/ogCard.js');
const { ogCache, badgeCache } = await import('../../src/presentation/presenters/formats/og.js');

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

// Width and height from the JPEG start-of-frame marker.
function jpegSize(buf) {
  expect(buf.readUInt16BE(0)).toBe(0xffd8);
  let i = 2;
  while (i < buf.length) {
    const marker = buf.readUInt16BE(i);
    if (marker >= 0xffc0 && marker <= 0xffc3) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('no SOF marker');
}

const bytes = req => req.buffer(true).parse((res, cb) => {
  const chunks = [];
  res.on('data', c => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('fetch', missing);
  ogCache.clear();
  badgeCache.clear();
});

describe('GET /og/<path>.jpg', () => {
  test('a verse answers a 1200×630 JPEG, cached a day', async () => {
    vi.spyOn(lookupService, 'lookup').mockResolvedValue(nephi());
    const res = await bytes(request(app).get('/og/lds/1.ne.5.3.jpg').set('Host', 'scripture.guide'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
    expect(jpegSize(res.body)).toEqual({ width: 1200, height: 630 });
    // the same lookup the page /lds/1.ne.5.3 does
    expect(lookupService.lookup.mock.calls[0][0]).toBe('1.ne.5.3');
    expect(lookupService.lookup.mock.calls[0][1].version).toBe('LDS');
  });

  test('the .png links already shared answer the same JPEG', async () => {
    vi.spyOn(lookupService, 'lookup').mockResolvedValue(nephi());
    const jpg = await bytes(request(app).get('/og/lds/1.ne.5.3.jpg'));
    const png = await bytes(request(app).get('/og/lds/1.ne.5.3.png'));
    expect(png.status).toBe(200);
    expect(png.headers['content-type']).toBe('image/jpeg');
    expect(png.headers['cache-control']).toBe('public, max-age=86400');
    expect(png.body.equals(jpg.body)).toBe(true);
    expect(lookupService.lookup).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['a network error', async () => { throw new TypeError('fetch failed'); }],
    ['a 5xx', async () => ({ ok: false, status: 503, headers: new Headers() })],
  ])('a card whose badge failed with %s is kept five minutes', async (_name, failing) => {
    vi.stubGlobal('fetch', failing);
    const spy = vi.spyOn(lookupService, 'lookup').mockResolvedValue(nephi());
    const first = await bytes(request(app).get('/og/lds/1.ne.5.3.jpg'));
    expect(first.status).toBe(200);
    expect(first.headers['cache-control']).toBe('public, max-age=300');
    await bytes(request(app).get('/og/lds/1.ne.5.3.jpg'));
    expect(spy).toHaveBeenCalledTimes(1);
    // six minutes later it is drawn again
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 6 * 60 * 1000);
    await bytes(request(app).get('/og/lds/1.ne.5.3.jpg'));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test('a missing badge (404) keeps the day-long cache', async () => {
    vi.spyOn(lookupService, 'lookup').mockResolvedValue(nephi());
    const res = await bytes(request(app).get('/og/lds/1.ne.5.3.jpg'));
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
  });

  test('a second request for the same card comes from the cache', async () => {
    const spy = vi.spyOn(lookupService, 'lookup').mockResolvedValue(nephi());
    const a = await bytes(request(app).get('/og/kjv/john.3.16.jpg'));
    const b = await bytes(request(app).get('/og/kjv/john.3.16.jpg'));
    expect(b.body.equals(a.body)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('/og/site.jpg is the site card', async () => {
    const res = await bytes(request(app).get('/og/site.jpg'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
    expect(jpegSize(res.body)).toEqual({ width: 1200, height: 630 });
  });

  test('an unknown reference, a failed lookup and a search answer the site card', async () => {
    const site = (await bytes(request(app).get('/og/site.jpg'))).body;
    vi.spyOn(lookupService, 'lookup').mockResolvedValue(empty());
    const unknown = await bytes(request(app).get('/og/kjv/zzz.99.jpg'));
    expect(unknown.status).toBe(200);
    expect(unknown.body.equals(site)).toBe(true);

    lookupService.lookup.mockRejectedValue(new Error('db down'));
    const failed = await bytes(request(app).get('/og/kjv/john.3.17.jpg'));
    expect(failed.status).toBe(200);
    expect(failed.body.equals(site)).toBe(true);

    const search = await bytes(request(app).get('/og/search/faith.jpg'));
    expect(search.status).toBe(200);
    expect(search.body.equals(site)).toBe(true);
  });

  test('Korean text, which Goudy Scripture lacks, does not fail', async () => {
    vi.spyOn(lookupService, 'lookup').mockResolvedValue(nephi({ text: '이와 같은 말로 나의 어머니가 나의 아버지에게 불평하였느니라.' }));
    const res = await bytes(request(app).get('/og/krbom/1.ne.5.3.jpg'));
    expect(res.status).toBe(200);
    expect(jpegSize(res.body)).toEqual({ width: 1200, height: 630 });
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

  test('poetry shows as plain text: no markers, line breaks as spaces', () => {
    const result = nephi({ text: '§Of David.¶▼Bless the Lord, O my soul,/_and all that is within me,/_bless his holy name.' });
    expect(cardContent(result, {}, 'Psalms 103:1').body).toBe('Of David. Bless the Lord, O my soul, and all that is within me, bless his holy name.');
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

describe('fitBody', () => {
  const { goudy } = ogFonts();
  test('short text is set large, up to 52px', () => {
    expect(fitBody(NEPHI_5_3, goudy, 1000, 300)).toMatchObject({ size: 52, truncated: false });
  });
  test('long text steps down to the smallest size and is cut', () => {
    const fit = fitBody('word '.repeat(400), goudy, 1000, 300);
    expect(fit.size).toBe(34);
    expect(fit.truncated).toBe(true);
  });
  test('text in between takes the largest size it fits whole at', () => {
    const fit = fitBody('word '.repeat(40), goudy, 1000, 300);
    expect(fit.truncated).toBe(false);
    expect(fit.size).toBeLessThan(52);
    expect(fit.size).toBeGreaterThan(34);
  });
});

describe('renderCard', () => {
  test('a very long title and body render within a second', async () => {
    const t0 = performance.now();
    const buf = await renderCard({ title: 'The Testimony of Three Witnesses and of Eight Witnesses 1:1–40', body: 'And '.repeat(400), badge: null });
    expect(jpegSize(buf)).toEqual({ width: 1200, height: 630 });
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe('link-preview tags', () => {
  test('og:image is the generated JPEG card for the page path', () => {
    const req = { headers: { host: 'scripture.guide' }, path: '/lds/1.ne.5.3' };
    const meta = new HtmlPresenter()._buildOgMeta(nephi(), {}, '1 Nephi 5:3', req);
    expect(meta.image).toBe('https://scripture.guide/og/lds/1.ne.5.3.jpg');
  });

  test('og:description is plain text: no markers, ｟｠ marks or "/" line breaks', () => {
    const req = { headers: { host: 'scripture.guide' }, path: '/nrsv/ps.103.1' };
    const verse = '§Of David.¶▼Bless the ｟Lord｠, O my soul,/_and all that is within me,/_bless his holy name.';
    const meta = new HtmlPresenter()._buildOgMeta(nephi({ text: verse }), {}, 'Psalms 103:1', req);
    expect(meta.description).toBe('Psalms 103:1— Of David. Bless the Lord, O my soul, and all that is within me, bless his holy name.');
  });

  test('the layout declares a 1200×630 JPEG and a large Twitter card', async () => {
    const layout = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src/presentation/views/layouts/main.ejs');
    const html = await ejs.renderFile(layout, {
      body: '', config: {}, title: '1 Nephi 5:3',
      ogMeta: { title: '1 Nephi 5:3 | Scripture Guide', image: 'https://scripture.guide/og/lds/1.ne.5.3.jpg', description: 'And after', url: 'https://scripture.guide/lds/1.ne.5.3' },
    });
    const tag = (attr, name) => html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`))?.[1];
    expect(tag('property', 'og:image')).toBe('https://scripture.guide/og/lds/1.ne.5.3.jpg');
    expect(tag('property', 'og:image:width')).toBe('1200');
    expect(tag('property', 'og:image:height')).toBe('630');
    expect(tag('property', 'og:image:type')).toBe('image/jpeg');
    expect(tag('name', 'twitter:card')).toBe('summary_large_image');
    expect(tag('name', 'twitter:image')).toBe('https://scripture.guide/og/lds/1.ne.5.3.jpg');
    expect(tag('name', 'twitter:title')).toBe('1 Nephi 5:3 | Scripture Guide');
    expect(tag('name', 'twitter:description')).toBe('And after');
  });

  test('a passage page carries them', async () => {
    vi.spyOn(lookupService, 'lookup').mockResolvedValue(nephi());
    const res = await request(app).get('/lds/1.ne.5.3').set('Host', 'scripture.guide');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<meta property="og:image" content="https://scripture.guide/og/lds/1.ne.5.3.jpg" />');
    expect(res.text).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });

  test('search pages use the site card', async () => {
    const res = await request(app).get('/search/faith').set('Host', 'scripture.guide');
    expect(res.text).toContain('<meta property="og:image" content="https://scripture.guide/og/site.jpg" />');
  });
});

describe('card frame', () => {
  test('the wood border shows on all four sides', async () => {
    const jpeg = (await import('jpeg-js')).default;
    const { data, width } = jpeg.decode(await renderCard({ title: 'John 3:16', body: 'For God so loved the world. '.repeat(40), badge: null }));
    const lum = (x, y) => { const i = (y * width + x) * 4; return 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2]; };
    // 8 px in from each edge, inside the 18 px frame: wood is dark, paper is light.
    for (const [side, x, y] of [['top', 600, 8], ['bottom', 600, 621], ['left', 8, 315], ['right', 1191, 315]]) {
      expect(lum(x, y), `${side} edge should be wood`).toBeLessThan(120);
    }
  });
});
