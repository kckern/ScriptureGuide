// Full-text search page data, ported from scriptures::search and search.php.
// Hits come from Sphinx when SPHINX_HOST is set, otherwise from MySQL filtered through the
// Sphinx tokenizer and stemmer (services/search/matcher.js).
import config from '../config/index.js';
import searchRepository from '../data/repositories/SearchRepository.js';
import { createSphinxClient } from '../data/external/sphinx.js';
import { queryStems, queryTerms, matchesTerms } from './search/matcher.js';
import { plainText, flattenText } from '../domain/rules/legacyText.js';
import { formatReference, slugifyRef, versionImg } from '../domain/rules/legacyReference.js';

export const REQUERY_OVER = 300;
const TOP = 5000;
// Candidate rows per fallback query. Without a (version, verse_id) index each page of a range
// query reads every row of its versions again, so those pages are large; the first query over all
// versions stops after REQUERY_OVER hits, so its pages are small.
const PAGE = 20000;
const FIRST_PAGE = 5000;
// Ids read per query by a LIKE-only scan over all versions (about 150 ms each)
const SCAN_CHUNK = 100000;
// Requery ranges (OT, NT, BoM, D&C+PGP) for LDS and KJV when the first query is too broad
export const BOOK_RANGES = [[1, 23145], [23146, 31102], [31103, 37706], [37707, 41995]];
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

// search.php: wrap the query (or its words' first three letters) in <span class='searchterm'>.
// PHP ran the query as a raw regex; here each word is escaped, so a query is matched as text.
// Its last step ran one preg_replace per query word over the text it had already marked up, so a
// repeated word (or two sharing a first three letters) wrapped a word again and again, and a word
// starting like span/class/searchterm wrapped the markup. Here that step is one pass over the
// text's words, each wrapped once, and words with no letters (a leading or trailing separator)
// mark nothing. The regexes are built once per query: makeHighlighter(query) for many texts.
const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WRAP = m => `<span class='searchterm'>${m}</span>`;

// Pieces joined by \W+, as PHP's str_replace(' ', '\W+'); a run of k separators (from empty
// pieces) becomes \W{k,}, which matches the same text without backtracking through each split.
function joinPieces(pieces) {
  let src = '';
  let seps = 0;
  pieces.forEach((p, i) => {
    if (i) seps++;
    if (!p) return;
    if (seps) src += seps === 1 ? '\\W+' : `\\W{${seps},}`;
    seps = 0;
    src += p;
  });
  if (seps) src += seps === 1 ? '\\W+' : `\\W{${seps},}`;
  return src;
}

// In the prefix step an empty piece is [a-z]*, which matches nothing inside a run of separators,
// so a long row of them makes the regex try every way of splitting each run it crosses (a query of
// 'the', 1000 spaces and 'lord' took 40 s on one verse). Rows of more than MAX_GAP empty pieces
// (more than MAX_GAP + 1 spaces or dots in a row, which no realistic query has) are cut to MAX_GAP.
// An empty piece also matches any one word between its separators, so a row of k empty pieces
// spans up to k words; the cap limits such a gap to MAX_GAP (8) words.
const MAX_GAP = 8;
function prefixPieces(pieces) {
  const out = [];
  let empties = 0;
  for (const p of pieces) {
    empties = p ? 0 : empties + 1;
    if (empties <= MAX_GAP) out.push(p);
  }
  return out;
}

export function makeHighlighter(query) {
  const pieces = String(query).split(' ');
  const phrase = `\\b${joinPieces(pieces.map(escapeRegex))}[a-z]*`;
  const prefixes = `\\b${prefixPieces(pieces).map(p => `${escapeRegex(p.slice(0, 3))}[a-z]*`).join('\\W+')}[a-z]*`;
  const stages = [phrase, prefixes].map(src => ({ test: new RegExp(src, 'i'), all: new RegExp(src, 'gi') }));
  // The per-word step's three-letter prefixes. PHP's preg_split('/[^a-z]+/i') gives an empty
  // piece for a leading or trailing non-letter ('faith charity!'), and its pattern /\b[a-z]*/i
  // wraps every word and puts an empty span at each word boundary (a live bug). Intended
  // difference: Node drops empty pieces and wraps only words that start like a query word.
  const words = new Set(String(query).split(/[^a-z]+/i).filter(Boolean).map(q => q.slice(0, 3).toLowerCase()));
  const marked = w => {
    const l = w.toLowerCase();
    return words.has(l.slice(0, 1)) || words.has(l.slice(0, 2)) || words.has(l.slice(0, 3));
  };
  return (text) => {
    const stage = stages[0].test.test(text) ? stages[0] : stages[1];
    if (stage.test.test(text)) return text.replace(stage.all, WRAP);
    return text.replace(/\b[a-z]+/gi, w => (marked(w) ? WRAP(w) : w));
  };
}

export function highlight(text, query) {
  return makeHighlighter(query)(text);
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
  /**
   * @param {object} [limits] budget of the MySQL fallback (config.search): fallbackMaxMs,
   *   fallbackMaxRows; fallbackScanChunk and clock for tests. The Sphinx path has none: it keeps
   *   the PHP site's LIMIT 99999 and 5,000 per requery range.
   */
  constructor(repo = searchRepository, sphinx = createSphinxClient(config.sphinx), limits = config.search) {
    this.repo = repo;
    this.sphinx = sphinx;
    this.limits = {
      fallbackMaxMs: limits?.fallbackMaxMs ?? 1500,
      fallbackMaxRows: limits?.fallbackMaxRows ?? 1000000,
      fallbackScanChunk: limits?.fallbackScanChunk ?? SCAN_CHUNK,
      clock: limits?.clock ?? Date.now,
    };
  }

  // A fresh budget for one fallback search: spent() once either limit is reached
  budget() {
    const { fallbackMaxMs, fallbackMaxRows, clock } = this.limits;
    const start = clock();
    return {
      scanned: 0,
      truncated: false,
      spent() { return this.scanned >= fallbackMaxRows || clock() - start >= fallbackMaxMs; },
    };
  }

  // Sphinx-equivalent hits: [{verse_id, version}]. The fallback stops when `budget` is spent and
  // sets budget.truncated.
  async hits(query, versions, { range = null, limit = 99999, stopAfter = Infinity, budget = this.budget() } = {}) {
    // No versions (a path version naming no version or volume, /places/edom): PHP queried
    // version IN (''), which matches nothing
    if (!versions.length) return [];
    if (this.sphinx) return this.sphinx.search(query, { versions, range, limit });
    const stems = queryStems(query);
    const terms = queryTerms(query);
    if (!stems.length) return [];
    const out = [];
    const page = Number.isFinite(stopAfter) ? FIRST_PAGE : PAGE;
    let afterId = 0;
    while (out.length < limit && out.length <= stopAfter) {
      if (budget.spent()) { budget.truncated = true; break; }
      const { rows, through, done, scanned } = await this.repo.candidates(stems, versions, { range, afterId, limit: page, scan: this.limits.fallbackScanChunk });
      budget.scanned += scanned;
      for (const r of rows) {
        if (matchesTerms(r.text, terms)) out.push({ verse_id: Number(r.verse_id), version: r.version });
      }
      if (done) break;
      afterId = through;
    }
    return out.slice(0, limit);
  }

  async search(rawQuery, { forcedVersion = null } = {}) {
    const query = String(rawQuery).replace(/\./g, ' ');
    let min = 0, max = 999999999;
    const budget = this.budget(); // one budget for all of this search's fallback queries

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

    let results = await this.hits(query, versions, { stopAfter: REQUERY_OVER, budget });
    if (results.length > REQUERY_OVER) {
      const firstPass = results;
      results = [];
      for (const range of BOOK_RANGES) {
        results.push(...await this.hits(query, ['LDS', 'KJV'], { range, limit: 5000, budget }));
      }
      // The fallback ran out of budget before the requeries found anything: show the first pass
      if (!results.length && budget.truncated) results = firstPass;
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

    const highlightText = makeHighlighter(query);
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
        highlighted: highlightText(text),
      };
    });

    return { query, count: groups.size, vols: [...vols.values()], rows, truncated: budget.truncated };
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
