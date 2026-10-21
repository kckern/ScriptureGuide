import { describe, test, expect, vi } from 'vitest';
import ejs from 'ejs';
import { fileURLToPath } from 'node:url';
import { SearchService, highlight, sortByOrder, volumeRange, formatOverride } from '../../src/services/SearchService.js';
import { stemPrefix } from '../../src/services/search/matcher.js';

// KJV wording (public domain) under synthetic version ids
const VERSES = {
  28679: { text: '¶And now abideth faith, hope, charity, these three; but the greatest of these is charity.', vol: 'nt', volume_id: 2, book_id: 46, chapter: 13, verse: 13, title: '1 Corinthians 13:13', short: '1 Cor.' },
  29564: { text: '¶Remembering without ceasing your work of faith, and labour of love, and patience of hope in our Lord Jesus Christ, in the sight of God and our Father;', vol: 'nt', volume_id: 2, book_id: 52, chapter: 1, verse: 3, title: '1 Thessalonians 1:3', short: '1 Thes.' },
  1: { text: '§¶In the beginning God created the heaven and the earth.', vol: 'ot', volume_id: 1, book_id: 1, chapter: 1, verse: 1, title: 'Genesis 1:1', short: 'Gen.' },
};
const VOL_LABEL = { ot: 'Old Testament', nt: 'New Testament' };

function fakeRepo({ texts = { 'LDS': [28679, 29564, 1], 'WEB': [28679] } } = {}) {
  const rows = [];
  let id = 0;
  for (const [version, ids] of Object.entries(texts)) for (const v of ids) rows.push({ id: ++id, verse_id: v, version, text: VERSES[v].text });
  return {
    searchableVersions: vi.fn(async forced => (forced ? forced.filter(f => ['LDS', 'WEB'].includes(f)) : ['LDS', 'WEB'])),
    volumeVersions: vi.fn(async () => []),
    versionsByPriority: vi.fn(async ids => ['LDS', 'KJV', 'WEB'].filter(v => ids.includes(v))),
    candidates: vi.fn(async (stems, versions, { afterId = 0, range } = {}) => {
      const found = rows.filter(r => r.id > afterId && versions.includes(r.version) && (!range || (r.verse_id >= range[0] && r.verse_id <= range[1]))
        && stems.every(s => r.text.toLowerCase().includes(stemPrefix(s))));
      return { rows: found, through: found.at(-1)?.id ?? afterId, done: true, scanned: found.length };
    }),
    standins: vi.fn(async () => []),
    verseInfo: vi.fn(async ids => ids.filter(i => VERSES[i]).map(i => ({
      verse_id: i, volume_id: VERSES[i].volume_id, book_id: VERSES[i].book_id, chapter: VERSES[i].chapter, verse: VERSES[i].verse,
      verse_title: VERSES[i].title, book_title_short: VERSES[i].short, vol_org: VERSES[i].vol, volume_title_med: VOL_LABEL[VERSES[i].vol],
    }))),
    chapterMaxima: vi.fn(async pairs => pairs.map(p => ({ book_id: p.bookId, chapter: p.chapter, max: 40 }))),
    texts: vi.fn(async pairs => pairs.map(p => ({ verse_id: p.verse_id, version: p.version, text: VERSES[p.verse_id].text }))),
    formats: vi.fn(async () => []),
  };
}

describe('SearchService (Sphinx)', () => {
  test('a quoted phrase reaches Sphinx as a phrase query', async () => {
    const sphinx = { search: vi.fn(async () => []) };
    await new SearchService(fakeRepo(), sphinx).search('"hand.of.the.lord".upon');
    expect(sphinx.search.mock.calls[0][0]).toBe('"hand of the lord" upon');
  });
});

describe('SearchService (MySQL fallback)', () => {
  test('finds verses containing every word, one row per verse, best-priority version', async () => {
    const svc = new SearchService(fakeRepo(), null);
    const r = await svc.search('faith.hope.charity');
    expect(r.query).toBe('faith hope charity');
    expect(r.count).toBe(1);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      verse_id: 28679, version: 'LDS', vol: 'nt', ref: '1 Corinthians 13:13', refShort: '1 Cor. 13:13',
      href: '/lds/1.cor.13.13', cover: 'ldskjv',
      text: 'And now abideth faith, hope, charity, these three; but the greatest of these is charity.',
    });
    expect(r.rows[0].highlighted).toContain("<span class='searchterm'>faith, hope, charity</span>");
    expect(r.vols).toEqual([{ key: 'nt', label: 'New Testament', count: 1 }]);
  });

  test('a quoted phrase matches the words together, in order', async () => {
    const svc = new SearchService(fakeRepo(), null);
    expect((await svc.search('"faith.hope.charity"')).count).toBe(1);
    expect((await svc.search('"hope.faith"')).count).toBe(0);
    expect((await svc.search('"work.of.faith".hope')).rows.map(r => r.verse_id)).toEqual([29564]);
  });

  test('orders rows by verse id and counts volumes in order', async () => {
    const svc = new SearchService(fakeRepo(), null);
    const r = await svc.search('god');
    expect(r.rows.map(x => x.verse_id)).toEqual([1, 29564]);
    expect(r.vols.map(v => v.key)).toEqual(['ot', 'nt']);
  });

  test('a version in the path limits the search to it', async () => {
    const repo = fakeRepo();
    const svc = new SearchService(repo, null);
    const r = await svc.search('charity', { forcedVersion: 'WEB' });
    expect(repo.searchableVersions).toHaveBeenCalledWith(['WEB']);
    expect(r.rows.map(x => [x.verse_id, x.version])).toEqual([[28679, 'WEB']]);
  });
});

// A repository whose table is endless: every chunk of the scan yields one matching verse.
function endlessRepo(onCandidates = () => {}) {
  const repo = fakeRepo();
  repo.candidates = vi.fn(async (stems, versions, { afterId = 0, scan } = {}) => {
    onCandidates();
    return { rows: [{ id: afterId + 1, verse_id: 28679, version: versions[0], text: VERSES[28679].text }], through: afterId + scan, done: false, scanned: scan };
  });
  return repo;
}

describe('SearchService (MySQL fallback budget)', () => {
  test('stops after the scanned-row budget and marks the result truncated', async () => {
    const repo = endlessRepo();
    const svc = new SearchService(repo, null, { fallbackMaxRows: 250000, fallbackMaxMs: 60000, fallbackScanChunk: 100000 });
    const r = await svc.search('charity');
    expect(repo.candidates).toHaveBeenCalledTimes(3); // 100k + 100k + 100k ≥ 250k
    expect(r.truncated).toBe(true);
    expect(r.count).toBe(1); // what was found so far is shown
  });
  test('stops after the time budget', async () => {
    let now = 0;
    const repo = endlessRepo(() => { now += 400; });
    const svc = new SearchService(repo, null, { fallbackMaxRows: Infinity, fallbackMaxMs: 1000, fallbackScanChunk: 1, clock: () => now });
    const r = await svc.search('charity');
    expect(repo.candidates).toHaveBeenCalledTimes(3); // 400, 800, 1200 ms
    expect(r.truncated).toBe(true);
  });
  test('a search that finishes within the budget is not truncated', async () => {
    const r = await new SearchService(fakeRepo(), null).search('charity');
    expect(r.truncated).toBe(false);
  });
});

describe('search view', () => {
  const VIEW = fileURLToPath(new URL('../../src/presentation/views/search.ejs', import.meta.url));
  const render = locals => ejs.renderFile(VIEW, { query: 'faith', count: 0, vols: [], rows: [], config: {}, slugref: 'faith', ogUrl: '', verNames: {}, browserClass: 'chrome', ...locals });
  test('a truncated search says the results are partial', async () => {
    expect(await render({ truncated: true })).toContain('Showing partial results — narrow your search');
    expect(await render({ truncated: false })).not.toContain('partial results');
  });
});

describe('SearchService with Sphinx', () => {
  test('is never truncated and passes the PHP limits through', async () => {
    const sphinx = { search: vi.fn(async () => [{ verse_id: 28679, version: 'LDS' }]) };
    const repo = fakeRepo();
    const r = await new SearchService(repo, sphinx, { fallbackMaxRows: 0, fallbackMaxMs: 0 }).search('charity');
    expect(r.truncated).toBe(false);
    expect(r.count).toBe(1);
    expect(sphinx.search.mock.calls[0][1]).toMatchObject({ limit: 99999 });
    expect(repo.candidates).not.toHaveBeenCalled();
  });
  test('uses Sphinx hits and requeries LDS/KJV by volume when over 300', async () => {
    const many = Array.from({ length: 301 }, (_, i) => ({ verse_id: 28679, version: `V${i}` }));
    const sphinx = { search: vi.fn(async (q, { range }) => (range ? (range[0] === 23146 ? [{ verse_id: 28679, version: 'LDS' }] : []) : many)) };
    const svc = new SearchService(fakeRepo(), sphinx);
    const r = await svc.search('faith');
    expect(sphinx.search).toHaveBeenCalledTimes(5);
    expect(sphinx.search.mock.calls[1][1]).toMatchObject({ versions: ['LDS', 'KJV'], range: [1, 23145], limit: 5000 });
    expect(r.count).toBe(1);
    expect(r.rows[0].version).toBe('LDS');
  });
});

describe('helpers', () => {
  test('highlight wraps the phrase, else word prefixes', () => {
    expect(highlight('faith, hope, charity', 'faith hope charity')).toBe("<span class='searchterm'>faith, hope, charity</span>");
    expect(highlight('hope and faith', 'faith hope')).toBe("<span class='searchterm'>hope</span> and <span class='searchterm'>faith</span>");
  });
  test('sortByOrder puts known keys first in the given order', () => {
    const m = new Map([['WEB', 1], ['LDS', 1], ['X', 1]]);
    expect([...sortByOrder(m, ['LDS', 'KJV', 'WEB']).keys()]).toEqual(['LDS', 'WEB', 'X']);
  });
  test('volumeRange', () => {
    expect(volumeRange('bom')).toEqual([31103, 37706]);
    expect(volumeRange('nt')).toEqual([23146, 31102]);
  });
  test('formatOverride straightens apostrophes for poetry', () => {
    expect(formatOverride('¶the Lord’s house', { format: 'poetry', s: '' })).toContain("Lord's");
    expect(formatOverride('¶the Lord’s house', null)).toBe('¶the Lord’s house');
  });
});
