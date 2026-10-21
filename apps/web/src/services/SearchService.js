// Full-text search page data, ported from scriptures::search and search.php.
// Hits come from Sphinx when SPHINX_HOST is set, otherwise from MySQL filtered through the
// Sphinx tokenizer and stemmer (services/search/matcher.js).
import config from '../config/index.js';
import searchRepository from '../data/repositories/SearchRepository.js';
import { createSphinxClient } from '../data/external/sphinx.js';
import { queryStems, queryTerms, matchesTerms, stemPrefix } from './search/matcher.js';
import { plainText, flattenText } from '../domain/rules/legacyText.js';
import { formatReference, slugifyRef, versionImg } from '../domain/rules/legacyReference.js';

const REQUERY_OVER = 300;
const TOP = 5000;
// Requery ranges (OT, NT, BoM, D&C+PGP) for LDS and KJV when the first query is too broad
const BOOK_RANGES = [[1, 23145], [23146, 31102], [31103, 37706], [37707, 41995]];
const BOC = [89431, 90772];
const DC1835 = [90773, 91462];

// scriptutil::getVolumeRange
export function volumeRange(vol) {
  const v = String(vol);
  const table = [
    [/^bible/i, 1, 31102], [/^ot/i, 1, 23145], [/^nt/i, 23146, 31102], [/^bo*m/i, 31103, 37706],
    [/^dc/i, 37707, 41360], [/^pgp/i, 41361, 41995], [/^le*c*f*/i, 41996, 42699], [/^jst/i, 42600, 73911],
    [/^tsp/i, 73912, 82862], [/^law/i, 82863, 83194], [/^(kora*n*|qura*n*)/i, 83195, 89430],
    [/^(1833|bo*c)/i, 89431, 90772], [/^(1835d*c*)/i, 90773, 91462], [/^dp/i, 91463, 91885],
    [/^bg/i, 91886, 92584], [/^sbom/i, 92668, 93382],
  ];
  const hit = table.find(([re]) => re.test(v));
  return hit ? [hit[1], hit[2]] : null;
}

// scriptutil::verformat: the version whose paragraph format a plain lookup borrows
export const verformat = v => (v === 'KJV' ? 'MEV' : v === 'NWT84' ? 'NWT' : v);

// utils::sortArrayByArray on the keys of a Map
export function sortByOrder(map, order) {
  const out = new Map();
  for (const k of order) if (map.has(k) && !out.has(k)) out.set(k, map.get(k));
  for (const [k, v] of map) if (!out.has(k)) out.set(k, v);
  return out;
}

// search.php: wrap the query (or its words' first three letters) in <span class='searchterm'>
export function highlight(text, query) {
  const wrap = (re) => text.replace(re, m => `<span class='searchterm'>${m}</span>`);
  try {
    let pattern = query.split(' ').join('\\W+');
    if (!new RegExp(`\\b${pattern}[a-z]*`, 'i').test(text)) {
      pattern = pattern.split('\\W+').map(p => `${p.slice(0, 3)}[a-z]*`).join('\\W+');
    }
    if (new RegExp(`\\b${pattern}[a-z]*`, 'i').test(text)) return wrap(new RegExp(`\\b${pattern}[a-z]*`, 'gi'));
    let out = text;
    for (const q of query.split(/[^a-z]+/i)) {
      const re = new RegExp(`\\b${q.slice(0, 3)}[a-z]*`, 'gi');
      out = out.replace(re, m => `<span class='searchterm'>${m}</span>`);
    }
    return out;
  } catch {
    return text;
  }
}

// Text in the version's own words, laid out in another version's paragraph format
// (scriptureData's format override); only the apostrophes survive into plain text.
export function formatOverride(text, fmt) {
  if (!fmt) return text;
  const linebreak = fmt.format === 'poetry' ? '/' : '';
  let t = `${fmt.s || ''}¶${linebreak}${flattenText(text).replace(/[_¶§]/gu, '')}`;
  t = t.replace(/▼|►/g, '').replace(/¶\//g, '¶').replace(/\//g, ` ${linebreak}`);
  if (fmt.format === 'poetry' || fmt.format === 'sense') {
    t = t.replace(/’/g, "'");
    t = t.replace(/(.{15,25})([,.;?!—:;][)”?]*)/gu, '$1$2/');
    t = t.replace(/\/\s*([a-z])/g, '/_ $1');
  }
  return t;
}

export class SearchService {
  constructor(repo = searchRepository, sphinx = createSphinxClient(config.sphinx)) {
    this.repo = repo;
    this.sphinx = sphinx;
  }

  // Sphinx-equivalent hits: [{verse_id, version}]
  async hits(query, versions, { range = null, limit = 99999, stopAfter = Infinity } = {}) {
    if (this.sphinx) return this.sphinx.search(query, { versions, range, limit });
    const stems = queryStems(query);
    const terms = queryTerms(query);
    if (!stems.length) return [];
    const prefixes = [...new Set(stems.map(stemPrefix))];
    const out = [];
    let afterId = 0;
    while (out.length < limit && out.length <= stopAfter) {
      const rows = await this.repo.candidates(prefixes, versions, { range, afterId, limit: 5000 });
      if (!rows.length) break;
      for (const r of rows) {
        if (matchesTerms(r.text, terms)) out.push({ verse_id: Number(r.verse_id), version: r.version });
      }
      afterId = rows[rows.length - 1].id;
    }
    return out.slice(0, limit);
  }

  async search(rawQuery, { forcedVersion = null } = {}) {
    const query = String(rawQuery).replace(/\./g, ' ');
    let min = 0, max = 999999999;

    let versions;
    if (forcedVersion) {
      versions = await this.repo.searchableVersions([forcedVersion]);
      if (!versions.length) {
        versions = await this.repo.volumeVersions(forcedVersion);
        const r = volumeRange(forcedVersion);
        if (r) [min, max] = r;
      }
    } else {
      versions = await this.repo.searchableVersions();
    }

    let results = await this.hits(query, versions, { stopAfter: REQUERY_OVER });
    if (results.length > REQUERY_OVER) {
      results = [];
      for (const range of BOOK_RANGES) {
        results.push(...await this.hits(query, ['LDS', 'KJV'], { range, limit: 5000 }));
      }
    }

    // verse_id → (version → verse_id)
    let groups = new Map();
    const allVersions = new Set();
    for (const { verse_id, version } of results) {
      if (verse_id < min || verse_id > max) continue;
      if (!groups.has(verse_id)) groups.set(verse_id, new Map());
      groups.get(verse_id).set(version, verse_id);
      allVersions.add(version);
    }
    if (groups.size > TOP) groups = new Map([...groups].slice(0, TOP));
    groups = new Map([...groups].sort((a, b) => a[0] - b[0]));

    // Book of Commandments / 1835 D&C hits fold into the verse they stand in for
    const nindex = new Map();
    for (const id of groups.keys()) {
      if (id >= BOC[0] && id <= BOC[1]) nindex.set(id, '1833');
      else if (id >= DC1835[0] && id <= DC1835[1]) nindex.set(id, '1835');
    }
    if (nindex.size) {
      const list = new Map();
      for (const r of await this.repo.standins([...nindex.keys()])) {
        if (!list.has(r.src_verse_id)) list.set(r.src_verse_id, []);
        list.get(r.src_verse_id).push(r.dst_verse_id);
      }
      for (const [n, dsts] of list) {
        const target = dsts.find(d => groups.has(d));
        if (target === undefined) continue;
        groups.get(target).set(nindex.get(n), n);
        groups.delete(n);
      }
      groups = new Map([...groups].sort((a, b) => a[0] - b[0]));
    }

    const sort = await this.repo.versionsByPriority([...allVersions]);

    // Which version and verse each row shows
    const picks = [...groups].map(([key, vers]) => {
      const version = sortByOrder(vers, sort).keys().next().value;
      return { key, version, verse_id: vers.get(version) };
    });

    const ids = [...new Set([...groups.keys(), ...picks.map(p => p.verse_id)])];
    const info = new Map((await this.repo.verseInfo(ids)).map(r => [Number(r.verse_id), r]));

    // Volume tabs, in order of first appearance
    const vols = new Map();
    for (const id of groups.keys()) {
      const i = info.get(id);
      if (!i) continue;
      if (!vols.has(i.vol_org)) vols.set(i.vol_org, { key: i.vol_org, label: i.volume_title_med, count: 0 });
      vols.get(i.vol_org).count++;
    }

    // Texts, with the format override plain lookups apply (KJV → MEV)
    const textRows = await this.repo.texts(picks.map(p => ({ verse_id: p.verse_id, version: p.version })));
    const texts = new Map(textRows.map(r => [`${r.verse_id}|${String(r.version).toUpperCase()}`, r.text]));
    const formats = new Map();
    for (const fv of new Set(picks.map(p => verformat(p.version)).filter((f, i) => f !== picks[i].version))) {
      const ids2 = picks.filter(p => verformat(p.version) === fv).map(p => p.verse_id);
      for (const r of await this.repo.formats(ids2, fv)) formats.set(`${r.verse_id}|${fv}`, r);
    }

    const shortRefs = await this.shortReferences(picks.map(p => p.verse_id), info);

    const rows = picks.map(p => {
      const i = info.get(p.verse_id);
      const fv = verformat(p.version);
      let raw = texts.get(`${p.verse_id}|${String(p.version).toUpperCase()}`) ?? '';
      if (fv !== p.version) raw = formatOverride(raw, formats.get(`${p.verse_id}|${fv}`));
      const text = plainText(raw);
      const refShort = shortRefs.get(p.verse_id) || '';
      return {
        vol: info.get(p.verse_id) ? i.vol_org : '',
        verse_id: p.verse_id,
        version: p.version,
        ref: i?.verse_title || '',
        refShort,
        href: `/${p.version.toLowerCase()}/${slugifyRef(refShort)}`,
        cover: versionImg(p.version, i?.volume_id),
        text,
        highlighted: highlight(text, query),
      };
    });

    return { query, count: groups.size, vols: [...vols.values()], rows };
  }

  // referenceFromVerseIds([id], 'book_title_short') for each id
  async shortReferences(ids, info) {
    const pairs = [...new Map(ids.filter(id => info.has(id)).map(id => {
      const i = info.get(id);
      return [`${i.book_id}|${i.chapter}`, { bookId: i.book_id, chapter: i.chapter }];
    })).values()];
    const maxima = new Map((await this.repo.chapterMaxima(pairs)).map(r => [`${r.book_id}|${r.chapter}`, Number(r.max)]));
    const meta = new Map([...info].map(([id, i]) => [id, { book: i.book_title_short, bookId: i.book_id, chapter: i.chapter, verse: i.verse }]));
    const out = new Map();
    for (const id of ids) out.set(id, formatReference([id], meta, (b, c) => maxima.get(`${b}|${c}`)));
    return out;
  }
}

export default new SearchService();
