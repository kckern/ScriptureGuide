import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as cheerio from 'cheerio';
import { AjaxController } from '../../src/app/controllers/AjaxController.js';
import { ajaxRouter } from '../../src/app/routes/ajax.js';

// Synthetic data; verse text is KJV (public domain).
const JOHN_3_16 = '¶For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.';
const meta = (verse_id, book_title, book_title_short, chapter, verse, chapter_max = 50, book_id = 1) =>
  ({ verse_id, book_id, chapter, verse, chapter_max, book_title, book_title_short, volume_id: 2 });
const META = {
  26137: meta(26137, 'John', 'John', 3, 16, 36, 43),
  549: meta(549, 'Genesis', 'Gen.', 22, 1, 24),
  550: meta(550, 'Genesis', 'Gen.', 22, 2, 24),
  551: meta(551, 'Genesis', 'Gen.', 22, 3, 24),
  30613: meta(30613, '1 John', '1 Jn.', 4, 9, 21, 62),
  1: meta(1, 'Genesis', 'Gen.', 1, 1, 31),
  2: meta(2, 'Genesis', 'Gen.', 1, 2, 31),
};
const TEXTS = {
  549: '§¶｟And｠ it came to pass after these things, that God did tempt Abraham',
  550: '¶And he said, Take now thy son',
  551: '¶And Abraham rose up early in the morning',
  30613: '¶In this was manifested the love of God toward us',
  26137: JOHN_3_16,
};

function makeRepo() {
  return {
    findVerse: vi.fn(async id => (id === 26137 ? { verse_id: 26137, volume_id: 2, verse_title: 'John 3:16', verse_title_short: 'John 3:16' } : null)),
    findVerseMeta: vi.fn(async ids => ids.map(id => META[id]).filter(Boolean)),
    findEnglishVersions: vi.fn(async () => [
      { verse_id: 26137, version: 'LDS', text: JOHN_3_16 },
      { verse_id: 26137, version: 'KJV', text: JOHN_3_16 },
      { verse_id: 26137, version: 'ASV', text: '¶For God so loved the world, that he gave his only begotten Son' },
      { verse_id: 26137, version: 'WEB', text: 'For God so loved the world' },
    ]),
    findFaxVersions: vi.fn(async () => ['kjv']),
    findReferences: vi.fn(async () => [
      { verse_id: 549, type: 'xref', significant: -1 },
      { verse_id: 550, type: 'xref', significant: 0 },
      { verse_id: 551, type: 'xref', significant: -1 },
      { verse_id: 30613, type: 'xref', significant: 0 },
    ]),
    findTexts: vi.fn(async (ids, version) => ids.filter(id => TEXTS[id]).map(id => ({ verse_id: id, version, text: TEXTS[id] }))),
    findAvailableVersions: vi.fn(async () => [
      { id: 'LDS', title: 'Current LDS Scriptures', title_long: 'Current LDS Scriptures' },
      { id: 'KJV', title: 'King James Version', title_long: 'King James Version' },
      { id: 'ASV', title: 'American Standard Version', title_long: 'American Standard Version' },
    ]),
    findVolumeId: vi.fn(async () => 2),
    findPrefs: vi.fn(async () => null),
  };
}

let repo, lookup, render, app;
beforeEach(() => {
  repo = makeRepo();
  lookup = { lookup: vi.fn(async (ref, config) => ({ ref, config })) };
  render = vi.fn(async (view, { data }) => `\n\t\t<h3 class="heading" ref="${data.ref}">${data.ref}</h3>\n\t\t<p class="prose"><span class="verse">For God so loved the world</span></p>`);
  const presenter = { serialize: r => ({ ref: r.ref, verses: [], h3ByVerse: {} }) };
  const references = { parse: ref => ({ verseIds: ref ? [26137] : [] }) };
  // PHP blocks of a non-numeric verse_id (LegacyBlockService), as cleanReference titled them
  const blocks = { blocks: vi.fn(async ref => [{ orig: ref.charAt(0).toUpperCase() + ref.slice(1), book: ref, verse_ids: [] }]) };
  const controller = new AjaxController({ lookup, references, repo, presenter, render, blocks });
  app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(ajaxRouter(controller));
});

describe('/versionselect', () => {
  it('lists the other versions with media.scripture.guide covers (GET)', async () => {
    const res = await request(app).get('/versionselect?ref=John%203:16&ver=LDS');
    expect(res.status).toBe(200);
    expect(res.type).toBe('text/html');
    const $ = cheerio.load(res.text);
    const imgs = $('img.option');
    expect(imgs.map((i, el) => $(el).attr('ver')).get()).toEqual(['KJV', 'ASV']);
    expect(imgs.first().attr('src')).toBe('https://media.scripture.guide/covers/kjv.jpg');
    expect(imgs.first().attr('title')).toBe('King James Version');
    expect(imgs.first().attr('seq')).toBe('');
  });
  it('accepts POST, strips *FMT from ver and echoes seq', async () => {
    const res = await request(app).post('/versionselect').type('form').send({ ref: 'John 3:16', ver: 'KJV*LDS', seq: '2' });
    const $ = cheerio.load(res.text);
    expect($('img.option').map((i, el) => $(el).attr('ver')).get()).toEqual(['LDS', 'ASV']);
    expect($('img.option[ver=LDS]').attr('src')).toBe('https://media.scripture.guide/covers/ldskjv.jpg');
    expect($('img.option').first().attr('seq')).toBe('2');
  });
  it('lists the versions of verse id 0 for a missing or unknown reference, as PHP did', async () => {
    // version_select.php queried verse_id = '' for a reference without verses; MySQL reads '' as 0
    const res = await request(app).get('/versionselect');
    expect(repo.findAvailableVersions).toHaveBeenCalledWith([0]);
    const $ = cheerio.load(res.text);
    expect($('img.option').map((i, el) => $(el).attr('ver')).get()).toEqual(['LDS', 'KJV', 'ASV']);
  });
});

describe('/vbox', () => {
  it('renders tabs, grouped references and versions', async () => {
    const res = await request(app).get('/vbox?verse_id=26137&ver=LDS&seq=1');
    expect(res.status).toBe(200);
    const $ = cheerio.load(res.text);
    expect($('.versebox').attr('seq')).toBe('1');
    expect($('.versebox').attr('verse_id')).toBe('26137');
    expect($('h5').text()).toBe('◀ John 3:16 ▶');
    expect($('li[link=verpanel]').text()).toBe('4 Versions');
    expect($('li[link=verpanel]').attr('lead')).toBe('1');
    expect($('li[link=refpanel]').text()).toBe('2 References');
    expect($('li[link=refpanel]').attr('lead')).toBe('0');

    const refs = $('.refpanel tr.matches td.gridbox');
    expect(refs.length).toBe(2);
    expect(refs.eq(0).find('a').attr('href')).toBe('/gen.22.1-3');
    expect(refs.eq(0).find('a').text()).toBe('Gen. 22:1–3');
    expect(refs.eq(0).find('.gridtext').attr('chapter')).toBe('gen.22');
    expect(refs.eq(0).find('span.dim').length).toBe(2);
    expect(refs.eq(0).find('.gridtext span').first().text()).toBe(' And it came to pass after these things, that God did tempt Abraham');
    expect(refs.eq(1).find('a').attr('href')).toBe('/1.jn.4.9');
    expect(refs.eq(1).find('img').attr('src')).toBe('/img/xref.png');
    expect($('.refpanel tr.original .gridtext').text()).toBe('For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.');

    const vers = $('.verpanel td.gridbox');
    expect(vers.length).toBe(4);
    expect(vers.eq(0).find('img.cover').attr('src')).toBe('https://media.scripture.guide/covers/ldskjv.jpg');
    expect(vers.eq(1).find('a').attr('href')).toBe('/kjv/john.3.16');
    expect(vers.eq(1).find('.fax').attr('ver')).toBe('KJV');
    expect(vers.eq(0).find('.fax').length).toBe(0);
    expect(vers.eq(0).find('span[stem=bego]').text()).toBe('begotten');
    // three cells per row
    expect($('.verpanel tr').first().find('td.gridbox').length).toBe(3);
    // the comparison panel is empty, like the live site
    expect($('.diffpanel .original').text()).toBe('');
  });
  it('accepts POST and escapes request values', async () => {
    const res = await request(app).post('/vbox').type('form').send({ verse_id: '26137', seq: "'><script>" });
    expect(res.text).not.toContain('<script>');
  });
  // PHP put verse_id into SQL as a string, and MySQL read a non-numeric one as 0 (its leading
  // digits otherwise), so live answers 200 with the box for verse id 0.
  it.each([['/vbox?verse_id=abc', 0], ['/vbox?q=abc', 0], ['/vbox', 0], ['/vbox?verse_id=26137abc', 26137]])('%s looks up verse id %i', async (path, id) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(200);
    expect(repo.findVerse).toHaveBeenCalledWith(id);
  });
  it('an empty verse_id shows the not-found text as the original verse (live looked up "")', async () => {
    for (const path of ['/vbox', '/vbox?verse_id=', '/vbox?verse_id=0']) {
      const $ = cheerio.load((await request(app).get(path)).text);
      expect($('.refpanel tr.original .gridtext').text()).toBe('No scripture verses found.');
    }
  });
  it('a non-numeric verse_id shows its PHP blocks as plain text (live looked it up as a reference)', async () => {
    const $ = cheerio.load((await request(app).get('/vbox?verse_id=abc')).text);
    expect($('.refpanel tr.original .gridtext').text().replace(/\s+/g, ' ').trim()).toBe('Abc No scripture verses found.');
  });
  it('the echoed verse_id is escaped', async () => {
    const res = await request(app).get('/vbox?verse_id=%3Cimg%20src%3Dx%3E');
    expect(res.text).not.toContain('<img src=x>');
  });
  it('leads with references when the saved preference says so', async () => {
    repo.findPrefs.mockResolvedValue({ options: { verpanel: 'ref' } });
    const res = await request(app).get('/vbox?verse_id=26137').set('Cookie', 'sg_user=Someone; sg_mail=a@example.com');
    const $ = cheerio.load(res.text);
    expect($('li[link=refpanel]').attr('lead')).toBe('1');
    expect($('li[link=verpanel]').attr('lead')).toBe('0');
  });
});

describe('/passage', () => {
  it('puts a filler h4 before the heading', async () => {
    const res = await request(app).get('/passage?ref=John%203:16&version=KJV');
    expect(res.status).toBe(200);
    expect(res.text.trim().startsWith("<h4 class='filler'></h4><h3 class=\"heading\"")).toBe(true);
    expect(lookup.lookup).toHaveBeenCalledWith('John 3:16', expect.objectContaining({ version: 'KJV' }));
  });
  it('builds the reference from options[start..end] and accepts POST', async () => {
    await request(app).post('/passage').type('form').send({ ref: 'ignored', version: 'KJV*LDS', 'options[start]': '1', 'options[end]': '2' });
    expect(lookup.lookup).toHaveBeenCalledWith('Genesis 1:1–2', expect.objectContaining({ version: 'KJV' }));
  });
  it('names an options[start..end] range as PHP did (referenceFromVerseIds)', async () => {
    const rows = [...Array.from({ length: 31 }, (_, i) => meta(i + 1, 'Genesis', 'Gen.', 1, i + 1, 31)), meta(32, 'Genesis', 'Gen.', 2, 1, 25)];
    repo.findVerseMeta.mockResolvedValue(rows);
    await request(app).get('/passage?ref=x&version=KJV&options[start]=1&options[end]=32');
    expect(lookup.lookup).toHaveBeenCalledWith('Genesis 1–2:1', expect.anything());
  });
  it('reads JST passages as JST references', async () => {
    await request(app).get('/passage?ref=Mark%205&version=JST');
    expect(lookup.lookup).toHaveBeenCalledWith('JST Mark 5', expect.anything());
  });
  it('highlights the search term in text only', async () => {
    const res = await request(app).get('/passage?ref=John%203:16&version=KJV&searchterm=loved');
    expect(res.text).toContain("so <span class='searchterm'>loved</span> the world");
  });
});

describe('/settings', () => {
  it('renders the anonymous defaults', async () => {
    const res = await request(app).get('/settings');
    expect(res.status).toBe(200);
    const $ = cheerio.load(res.text);
    expect($('h3').text()).toBe('Scripture.Guide Preferences for ');
    expect($('select[vol]').length).toBe(14);
    expect($('select[vol=bible][cmp=t] option').first().text()).toBe('📚 Current LDS Scriptures');
    expect($('select[vol=bible][cmp=t] option[selected]').length).toBe(0);
    expect($('input[type=checkbox][checked]').length).toBe(5);
    expect($('input[name=verpanel][value=ref]').attr('checked')).toBe('checked');
    expect($('#mail').attr('value')).toBe('');
    expect(repo.findPrefs).not.toHaveBeenCalled();
  });
  it('marks saved choices for a signed-in visitor', async () => {
    repo.findPrefs.mockResolvedValue({ versions: { bible: { t: 'KJV' } }, options: { audio: 'false', voice: 'female', verpanel: 'ver' } });
    const res = await request(app).post('/settings').set('Cookie', 'sg_user=Ann; sg_mail=ann@example.com');
    const $ = cheerio.load(res.text);
    expect($('h3').text()).toBe('Scripture.Guide Preferences for Ann');
    expect($('select[vol=bible][cmp=t] option[selected]').attr('value')).toBe('KJV');
    expect($('input[name=audio]').attr('checked')).toBeUndefined();
    expect($('select[key=voice] option[selected]').attr('value')).toBe('female');
    expect($('input[name=verpanel][value=ver]').attr('checked')).toBe('checked');
  });
});

describe('/save_prefs', () => {
  it('accepts the request and stores nothing', async () => {
    const res = await request(app).post('/save_prefs').type('form').send({ 'payload[user][mail]': "x' OR 1=1 --" });
    expect(res.status).toBe(200);
    expect(res.text).toBe('');
    for (const fn of Object.values(repo)) expect(fn).not.toHaveBeenCalled();
  });
});
