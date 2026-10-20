// Parallel view (`a~b` URLs), ported from lib.php.inc (URL parsing), lib.parallel.php.inc
// (verse matching and row layout) and parallel.php (markup data) in the PHP site.
import { createHash } from 'node:crypto';
import referenceService from './ReferenceService.js';
import { ScriptureLookupService } from './ScriptureLookupService.js';
import verseRepository from '../data/repositories/VerseRepository.js';
import parallelRepository from '../data/repositories/ParallelRepository.js';
import { arrayText, splitVerseLines } from '../domain/rules/legacyText.js';
import { formatReference, slugifyRef, versionImg } from '../domain/rules/legacyReference.js';
import { defaultVersions } from '../domain/rules/defaultVersions.js';

// A left side with no verses, or one of these years, is an edition: "1830~msg/john1"
const EDITION_YEARS = ['1830', '1829', '1833', '1853', '1837', '1840', '1841', '1879', '1920', '1981', '2013'];

// scriptures::defaultVersions: the version used when none is given, by verse id range
export function defaultVersion(ids) {
  return defaultVersions([], ids)[0]?.version ?? null;
}

// lib.php.inc: split "ver/ref~ver/ref" into sides
export function parseSides(q) {
  const sides = String(q).split('~');
  if (sides.length < 2) return null;
  const side = s => {
    const parts = s.split('/');
    return { ver: parts.length === 2 ? parts[0].toLowerCase() : '', ref: parts[parts.length - 1] };
  };
  return { left: side(sides[0]), right: side(sides[1]) };
}

const md5 = s => createHash('md5').update(s).digest('hex');
// json_encode of a PHP array keyed by verse id
const jsonIds = ids => `{${ids.map(id => `"${id}":${id}`).join(',')}}`;
const isEmpty = v => v == null || v.length === 0;
const leadingNumber = k => parseFloat(String(k)) || 0;

/**
 * lib.parallel.php.inc row layout. Pure: everything it needs is passed in.
 * Rows are [{ key, left: number[]|null, right: number[]|null }] in display order.
 */
export function alignRows({ leftids, rightids, references, compounds = {}, lver, rver }) {
  const index2d = new Map(); // `${a}|${b}` → { sig:Set, std:Set }
  const sigs = new Set();
  const matches = new Map();
  const pair = (a, b) => { const k = `${a}|${b}`; if (!index2d.has(k)) index2d.set(k, { sig: new Set(), std: new Set() }); return index2d.get(k); };

  // k=1: dst on the left, src on the right; k=2: src on the left, dst on the right
  for (const [rows, from, to] of [[references.backward, 'dst_verse_id', 'src_verse_id'], [references.forward, 'src_verse_id', 'dst_verse_id']]) {
    for (const r of rows) {
      const src = Number(r.src_verse_id), dst = Number(r.dst_verse_id);
      const significant = Number(r.significant), standin = Number(r.standin);
      if (significant > 0) { sigs.add(src); sigs.add(dst); }
      for (const [a, b] of [[src, dst], [dst, src]]) { const p = pair(a, b); p.sig.add(significant); p.std.add(standin); }
      const f = Number(r[from]), t = Number(r[to]);
      if (leftids.includes(f) && rightids.includes(t)) {
        if (!matches.has(f)) matches.set(f, []);
        matches.get(f).push(t);
      }
    }
  }

  let rows = new Map(); // key → { left: Map|null, right: Map|null }
  const row = k => { if (!rows.has(k)) rows.set(k, { left: null, right: null }); return rows.get(k); };
  const add = (k, side, id) => { const r = row(k); if (!r[side]) r[side] = new Map(); r[side].set(id, id); };

  if (matches.size) {
    const rmatches = new Map();
    for (const [key, vals] of matches) for (const v of vals) { if (!rmatches.has(v)) rmatches.set(v, []); rmatches.get(v).push(key); }

    const stack = new Map();
    for (const id of leftids) stack.set(id, 'left');
    for (const id of rightids) stack.set(id, 'right');

    const rownumindex = new Map();
    const rightrowindex = new Map();
    let rownum = leftids[0];
    for (const lid0 of leftids) {
      let lid = lid0;
      if (!stack.has(lid)) continue;
      if (matches.has(lid)) rownum = lid;
      add(rownum, 'left', lid);
      stack.delete(lid);
      if (isEmpty(matches.get(lid))) continue;
      for (const rid of [...matches.get(lid)]) {
        if (!stack.has(rid)) continue;
        add(rownum, 'right', rid);
        rownumindex.set(rid, rownum);
        stack.delete(rid);
        if (!rightrowindex.has(rid)) rightrowindex.set(rid, new Map());
        rightrowindex.get(rid).set(rownum, rownum);
        if (isEmpty(rmatches.get(rid))) continue;
        for (const l of rmatches.get(rid)) {
          lid = l; // PHP reuses $lid here
          add(rownum, 'left', l);
          rownumindex.set(l, rownum);
          stack.delete(l);
        }
        const anyRight = [...stack.values()].includes('right');
        const m = matches.get(lid) || [];
        if (!anyRight || m[m.length - 1] === rid) rownum++;
      }
    }

    // Right row index: 999999 → entry of the largest rid, rids descending, 0 → entry of the smallest
    const rids = [...rightrowindex.keys()].sort((a, b) => b - a);
    const rri = [];
    if (rids.length) {
      rri.push([999999, rightrowindex.get(rids[0])]);
      for (const r of rids) rri.push([r, rightrowindex.get(r)]);
      rri.push([0, rightrowindex.get(rids[rids.length - 1])]);
    }

    // Group remaining verses into runs of consecutive ids
    const groups = [];
    let lastid = null;
    for (const [id, side] of stack) {
      if (id !== (lastid ?? 0) + 1) groups.push(new Map());
      const g = groups[groups.length - 1];
      if (!g.has(side)) g.set(side, []);
      g.get(side).push(id);
      lastid = id;
    }
    let lindex;
    for (const sides of groups) {
      for (const [side, ids] of sides) {
        if (side === 'left') {
          row(ids[0]).left = new Map(ids.map(i => [i, i]));
        } else {
          const last = ids[ids.length - 1];
          for (const [rid, lids] of rri) {
            for (const lid of lids.values()) {
              const sub = rid === 999999 ? 0 : 1;
              if (last >= rid) break;
              lindex = `${lid - sub}.1.${rid}.${md5(jsonIds(ids))}`;
            }
            if (last >= rid) break;
          }
          // end($ids) leaves PHP's array pointer on the last id, so current() later reads that one
          const placed = new Map(ids.map(i => [i, i]));
          placed.atEnd = true;
          row(lindex).right = placed;
        }
      }
    }

    rows = new Map([...rows].sort((a, b) => leadingNumber(a[0]) - leadingNumber(b[0])));

    // Fix unmatched start and end
    const get = k => rows.get(k ?? '') || {};
    let keys = [...rows.keys()];
    let [a1, a2] = keys;
    if (isEmpty(get(a1).right) && isEmpty(get(a2).left)) {
      const tmp = { left: get(a1).left ?? null, right: get(a2).right ?? null };
      rows.delete(a2 ?? '');
      setKey(rows, a1 ?? '', tmp);
    }
    keys = [...rows.keys()].reverse();
    const [z2, z1] = keys;
    if (isEmpty(get(z1).left) && isEmpty(get(z2).right)) {
      const tmp = { left: get(z2).left ?? null, right: get(z1).right ?? null };
      rows.delete(z2 ?? '');
      setKey(rows, z1 ?? '', tmp);
    }
  } else {
    // Side by side, folding compound verses ("*" rows) on either side
    let lids = [...leftids], rids2 = [...rightids];
    const lc = { ...(compounds[lver] || {}) }, rc = { ...(compounds[rver] || {}) };
    const merged = { right: {}, left: {} };
    if (Object.keys(lc).length) {
      let p = 0; const out = [];
      for (const lid of lids) {
        const group = [rids2[p++]];
        while ((lc[lid] || 0) > 1) { group.push(rids2[p++]); lc[lid]--; }
        if (group.length > 1) merged.right[group[group.length - 1]] = group;
        out.push(group[group.length - 1]);
      }
      rids2 = out;
    }
    if (Object.keys(rc).length) {
      let p = 0; const out = [];
      for (const rid of rids2) {
        const group = [lids[p++]];
        while ((rc[rid] || 0) > 1) { group.push(lids[p++]); rc[rid]--; }
        if (group.length > 1) merged.left[group[group.length - 1]] = group;
        out.push(group[group.length - 1]);
      }
      lids = out;
    }
    lids.forEach((lid, i) => rows.set(i, { left: new Map([[lid, lid]]), right: new Map([[rids2[i] ?? null, rids2[i] ?? null]]) }));
    for (let i = lids.length; i < rids2.length; i++) rows.set(i, { left: null, right: new Map([[rids2[i], rids2[i]]]) });
    for (const id of [...leftids, ...rightids]) sigs.add(id);
    rows.merged = merged;
  }
  const merged = rows.merged || { left: {}, right: {} };

  // Prevent stragglers: a lone left after a lone right (or the reverse) share a row
  const keys = [...rows.keys()];
  keys.forEach((k, i) => {
    const cur = rows.get(k), prev = i > 0 ? rows.get(keys[i - 1]) : undefined;
    if (!cur || !prev) return;
    const has = (r, s) => r[s] != null;
    if ((has(cur, 'left') && !has(cur, 'right') && has(prev, 'right') && !has(prev, 'left')) ||
        (has(cur, 'right') && !has(cur, 'left') && has(prev, 'left') && !has(prev, 'right'))) {
      cur.left = isEmpty(cur.left && [...cur.left]) ? prev.left : cur.left;
      cur.right = isEmpty(cur.right && [...cur.right]) ? prev.right : cur.right;
      rows.delete(keys[i - 1]);
    }
  });

  const ids = m => (m ? [...m.keys()] : []);
  const current = m => { const k = ids(m); return m?.atEnd ? k[k.length - 1] : k[0]; };
  const out = [...rows].map(([key, r]) => ({
    key, left: ids(r.left), right: ids(r.right), current: { left: current(r.left), right: current(r.right) },
  }));
  const found = new Set();
  for (const r of out) for (const l of r.left) for (const rr of r.right) if (index2d.has(`${l}|${rr}`)) found.add(r.key);
  return { rows: out, index2d, sigs, found, anymatches: found.size > 0, merged };
}

function setKey(map, key, value) {
  if (map.has(key)) map.set(key, value);
  else map.set(key, value); // a new key goes to the end, as in PHP
}

export class ParallelService {
  constructor({ refs = referenceService, verses = verseRepository, repo = parallelRepository } = {}) {
    this.refs = refs;
    this.verses = verses;
    this.repo = repo;
  }

  // scriptures::lookup($ref, meta_only) → verse ids
  async verseIds(ref) {
    if (!ref) return [];
    const parsed = this.refs.parse(ref);
    if (!parsed.isEmpty) return parsed.verseIds.map(Number);
    const slug = ScriptureLookupService.parseSlug(ref);
    if (!slug) return [];
    const r = await this.verses.findBySlug(slug.bookSlug, slug.chapter, slug.verseStart, slug.verseEnd);
    return r ? r.verseIds.map(Number) : [];
  }

  // renderArray: verse_id → { version, verse_id, ref, text, compound }
  async arrayLookup(ids, ver) {
    const out = new Map();
    if (!ids.length) return out;
    const candidates = [...new Set([ver, defaultVersion(ids)].filter(Boolean).map(v => v.toUpperCase()))];
    for (const version of candidates) {
      const rows = await this.repo.verses(ids, version);
      if (!rows.length) continue;
      let lastId = null, gap = [];
      for (const r of rows) {
        const id = Number(r.verse_id);
        const lines = splitVerseLines(r.text);
        if (lines.length && lines.every(l => l === '*')) {
          if (lastId == null) continue;
          gap.push(id);
          const prev = out.get(lastId);
          prev.compound = gap.length;
          prev.refIds = [...gap];
          continue;
        }
        out.set(id, { version: r.version, verse_id: id, ref: `${r.book} ${r.chapter}:${r.verse}`, text: arrayText(r.text) });
        lastId = id; gap = [id];
      }
      return out;
    }
    for (const r of await this.repo.indexVerses(ids)) {
      out.set(Number(r.verse_id), { version: 'INDEX', verse_id: Number(r.verse_id), ref: '', text: arrayText(r.text) });
    }
    return out;
  }

  async build(q) {
    const sides = parseSides(q);
    if (!sides) return null;
    const { left, right } = sides;

    if (!left.ver && right.ver) {
      const ids = await this.verseIds(left.ref);
      if (!ids.length || EDITION_YEARS.includes(left.ref)) {
        left.ver = left.ref;
        left.ref = right.ref;
      }
    }

    // Slugs for the switch and full-chapter links
    const leftVerses = await this.verseIds(left.ref);
    const rightVerses = await this.verseIds(right.ref);
    const meta = await this.metaFor([...leftVerses, ...rightVerses]);
    const ref = (ids, field) => this.reference(ids, field, meta);

    const leftRefSlug = slugifyRef(ref(leftVerses, 'book_title_short'));
    let leftslug = left.ver ? `${left.ver}/${leftRefSlug}` : leftRefSlug;
    const rightRefSlug = slugifyRef(ref(rightVerses, 'book_title_short'));
    let rightslug = rightRefSlug;
    if (right.ver && right.ver !== left.ver) rightslug = `${right.ver}/${rightRefSlug}`;
    let swapslug = `${rightslug}~${leftslug}`;
    if (leftVerses.join() === rightVerses.join()) {
      leftslug = left.ver;
      swapslug = `${right.ver}~${left.ver}/${rightRefSlug}`;
    }
    const fullslug = `${leftslug}~${rightslug}`.toLowerCase();

    // Verses on each side
    const leftFlat = await this.arrayLookup(leftVerses, left.ver);
    const rightFlat = await this.arrayLookup(rightVerses, right.ver);
    const lver = leftFlat.values().next().value?.version ?? '';
    const rver = rightFlat.values().next().value?.version ?? '';
    const leftids = [...leftFlat.keys()];
    const rightids = [...rightFlat.keys()];

    const chapterIds = {
      left: await this.repo.chapterVerseIds(leftids),
      right: await this.repo.chapterVerseIds(rightids),
    };
    const meta2 = await this.metaFor([...chapterIds.left, ...chapterIds.right, ...leftids, ...rightids], meta);
    const ref2 = (ids, field) => this.reference(ids, field, meta2);
    const lchapter = slugifyRef(ref2(chapterIds.left, 'book_title_short'));
    const rchapter = slugifyRef(ref2(chapterIds.right, 'book_title_short'));
    const chslug = `${lver}/${lchapter}~${rver}/${rchapter}`;
    const ischapter = chapterIds.left.join() === leftVerses.join() && chapterIds.right.join() === rightVerses.join();

    const references = await this.repo.standinReferences(leftids, rightids);
    const compounds = {};
    for (const [ver, flat] of [[lver, leftFlat], [rver, rightFlat]]) {
      for (const v of flat.values()) if (v.compound) (compounds[ver] ||= {})[v.verse_id] = v.compound;
    }
    const layout = alignRows({ leftids, rightids, references, compounds, lver, rver });

    // Compound verses fold texts and references into one cell
    const bank = { left: new Map([...leftFlat].map(([k, v]) => [k, { ...v }])), right: new Map([...rightFlat].map(([k, v]) => [k, { ...v }])) };
    for (const side of ['left', 'right']) {
      for (const [id, group] of Object.entries(layout.merged[side])) {
        const b = bank[side];
        const target = b.get(Number(id));
        if (!target) continue;
        target.text = `${b.get(group[0])?.text ?? ''} ${target.text}`;
        target.ref = ref2(group, 'book_title_med');
      }
    }
    for (const b of [bank.left, bank.right]) {
      for (const v of b.values()) if (v.refIds) v.ref = ref2(v.refIds, 'book_title_short');
    }

    const fax = {
      left: await this.repo.faxIds(lver, layout.rows.map(r => r.current.left)),
      right: await this.repo.faxIds(rver, layout.rows.map(r => r.current.right)),
    };

    let sig = '';
    const rows = layout.rows.map(item => {
      if (isEmpty(item.left) || isEmpty(item.right)) sig = 'sig';
      let verseId;
      let leftText = '', rightText = '', leftRef, rightRef;
      for (const id of item.left) { verseId = id; leftText += ' ' + (bank.left.get(id)?.text ?? ''); }
      leftRef = item.left.length === 1 ? (bank.left.get(verseId)?.ref ?? '') : ref2(item.left, 'book_title_short');
      for (const id of item.right) { verseId = id; rightText += ' ' + (bank.right.get(id)?.text ?? ''); }
      rightRef = item.right.length === 1 ? (bank.right.get(verseId)?.ref ?? '') : ref2(item.right, 'book_title_short');
      for (const id of [...item.left, ...item.right]) if (layout.sigs.has(id)) sig = 'sig';
      let standinclass = '';
      for (const l of item.left) for (const r of item.right) {
        const p = layout.index2d.get(`${l}|${r}`);
        standinclass = p ? (p.std.has(1) ? 'quote' : 'allusion') : 'sidebyside';
      }
      if (!layout.found.has(item.key) && layout.anymatches) standinclass = 'greyout';
      return {
        id: item.key,
        className: `diffrow ${sig} ${standinclass}`,
        left: { verseId: item.current.left ?? '', ref: leftRef || '', slug: slugifyRef(leftRef), text: leftText, fax: fax.left.has(verseId) },
        right: { verseId: item.current.right ?? '', ref: rightRef || '', slug: slugifyRef(rightRef), text: rightText, fax: fax.right.has(verseId) },
      };
    });

    const leftheader = ref2(leftVerses, 'book_title_med');
    const rightheader = ref2(rightVerses, 'book_title_med');
    const htmlHeader = h => (/[,;]/.test(h) ? h.replace(/(\s+)(\d+)/g, '$1 $2') : h);
    const volumeOf = ids => meta2.get(ids[0])?.volume_id;

    return {
      title: `${leftheader} ~ ${rightheader}`,
      lver, rver,
      limg: versionImg(lver, volumeOf(leftids)),
      rimg: versionImg(rver, volumeOf(rightids)),
      leftheader, rightheader,
      htmlLeftheader: htmlHeader(leftheader),
      htmlRightheader: htmlHeader(rightheader),
      leftheaderSlug: slugifyRef(leftheader),
      rightheaderSlug: slugifyRef(rightheader),
      swapslug, chslug, fullslug, ischapter,
      rows,
    };
  }

  async metaFor(ids, known = new Map()) {
    const need = [...new Set(ids)].filter(id => !known.has(id));
    const out = new Map(known);
    const rows = await this.repo.verseMeta(need);
    const maxima = new Map(known.maxima || []);
    const pairs = [...new Map(rows.map(r => [`${r.book_id}|${r.chapter}`, { bookId: r.book_id, chapter: r.chapter }])).values()]
      .filter(p => !maxima.has(`${p.bookId}|${p.chapter}`));
    for (const m of await this.repo.chapterMaxima(pairs)) maxima.set(`${m.book_id}|${m.chapter}`, Number(m.max));
    for (const r of rows) out.set(Number(r.verse_id), r);
    out.maxima = maxima;
    return out;
  }

  reference(ids, field, meta) {
    const info = new Map();
    for (const id of ids) {
      const m = meta.get(id);
      if (m) info.set(id, { book: m[field], bookId: m.book_id, chapter: m.chapter, verse: m.verse });
    }
    return formatReference(ids, info, (b, c) => meta.maxima.get(`${b}|${c}`));
  }
}

export default new ParallelService();
