// Ports of the PHP site's reference helpers (scriptutil.php.inc) that the parallel and search
// pages print verbatim: referenceFromVerseIds, slufigyRef, versionIMG, isConsecutive.
// formatReference is pure: callers pass verse metadata and chapter maxima, so it is unit-testable.

export function slugifyRef(ref) {
  if (!ref) return '';
  return String(ref).toLowerCase()
    .replace(/[\s.:]+/g, '.')
    .replace(/([;,])\./g, '$1')
    .replace(/–/g, '-');
}

export function isConsecutive(ids) {
  if (ids.length === 1) return true;
  for (let i = 0; i < ids.length - 1; i++) if (Number(ids[i]) + 1 !== Number(ids[i + 1])) return false;
  return true;
}

// LDS covers by volume id (versionIMG); other versions use their lowercase id.
export function versionImg(version, volumeId) {
  if (String(version).toUpperCase() === 'LDS') {
    const v = volumeId || 3;
    if (v === 1 || v === 2) return 'ldskjv';
    if (v === 3) return 'lds-bom2';
    if (v === 4) return 'lds-dc2';
    if (v === 5) return 'lds-pgp2';
  }
  return String(version).replace(/\*.*$/, '').toLowerCase();
}

const first = m => m.values().next().value;
const last = m => { let v; for (v of m.values()); return v; };
const firstKey = m => m.keys().next().value;
const lastKey = m => { let k; for (k of m.keys()); return k; };
const getOrSet = (m, k) => { if (!m.has(k)) m.set(k, new Map()); return m.get(k); };
const pregQuote = s => s.replace(/[.\\+*?[^\]$(){}=!<>|:\-#/]/g, '\\$&');

/**
 * referenceFromVerseIds($verse_ids, $bookfield) from the PHP site.
 * @param {number[]} verseIds  in caller order (PHP never sorts: $dontsort is undefined)
 * @param {Map<number,{book:string, bookId:number, chapter:number, verse:number}>} info
 * @param {(bookId:number, chapter:number) => number} chapterMax
 */
export function formatReference(verseIds, info, chapterMax) {
  const ids = [...new Set((verseIds || []).map(Number))].filter(id => info.has(id));
  if (!ids.length) return '';

  // Segments: break when both the chapter changes and the ids are not consecutive
  const segments = new Map();
  let seg = 0, lastChapter, lastId;
  for (const id of ids) {
    const ch = `${info.get(id).bookId}${info.get(id).chapter}`;
    if (ch !== lastChapter && id !== (lastId ?? 0) + 1) seg++;
    if (!segments.has(seg)) segments.set(seg, []);
    segments.get(seg).push(id);
    lastId = id; lastChapter = ch;
  }

  // ref[seg][book][chapter][block][verse]
  const ref = new Map();
  const bookIds = new Map();
  const multis = new Set(), multics = new Set();
  let block = 0;
  for (const [segid, segment] of segments) {
    const sorted = [...segment].sort((a, b) => a - b);
    const books = getOrSet(ref, segid);
    for (const id of sorted) {
      const { book, bookId, chapter, verse } = info.get(id);
      bookIds.set(book, bookId);
      const chapters = getOrSet(books, book);
      const blocks = getOrSet(chapters, chapter);
      if (!blocks.get(block)?.has(verse - 1)) block++;
      getOrSet(blocks, block).set(verse, verse);
    }
    if (isConsecutive(segment) && books.size > 1) multis.add(segid);
    else if (isConsecutive(segment) && first(books).size > 1) multics.add(segid);
  }
  const max = (book, chapter) => chapterMax(bookIds.get(book), chapter);

  let reference = '';
  let segCount = 0;
  let booklist = [];
  let startfull, endfull;
  for (const [segid, books] of ref) {
    if (multics.has(segid)) {
      const book = firstKey(books);
      const chs = books.get(book);
      const minch = firstKey(chs), maxch = lastKey(chs);
      let minv = first(first(chs.get(minch)));
      let maxv = last(last(chs.get(maxch)));
      minv = minv === 1 ? '' : `:${minv}`;
      maxv = (maxv === max(book, maxch) && minv === '') ? '' : `:${maxv}`;
      reference += `;${book} ${minch}${minv}–${maxch}${maxv};`;
      continue;
    }
    if (multis.has(segid)) {
      const minbook = firstKey(books), maxbook = lastKey(books);
      const minch = firstKey(books.get(minbook)), maxch = lastKey(books.get(maxbook));
      let minv = first(first(books.get(minbook).get(minch)));
      let maxv = last(last(books.get(maxbook).get(maxch)));
      minv = minv === 1 ? '' : `:${minv}`;
      maxv = maxv === max(maxbook, maxch) ? '' : `:${maxv}`;
      reference += `${minbook} ${minch}${minv}–${maxbook} ${maxch}${maxv};`;
      continue;
    }
    if (segCount > 0) reference += '; ';
    let bookCount = 0;
    for (const [book, chapters] of books) {
      if (bookCount > 0) reference += '; ';
      if (book !== booklist[booklist.length - 1]) reference += `${book} `;
      booklist.push(book);
      let chapterCount = 0;
      const chapterlist = [...chapters.keys()];
      const allSingleBlocks = [...chapters.values()].every(b => b.size === 1);

      if (chapterlist.length > 1 && allSingleBlocks) {
        // Consecutive chapters
        const fulls = new Map(), partials = new Map(), sort = new Map();
        for (const [chapter, blocks] of chapters) {
          if (last(first(blocks)) === max(book, chapter) && first(first(blocks)) === 1) {
            fulls.set(chapter, chapter); sort.set(chapter, 'full');
          } else {
            partials.set(chapter, blocks.get(chapter)); // PHP indexes the blocks by chapter number
            sort.set(chapter, 'partial');
          }
        }
        if (!partials.size) {
          reference += `${first(fulls)}–${last(fulls)}`;
        } else {
          if (fulls.size && Math.max(...fulls.keys()) > Math.max(...partials.keys())) endfull = true;
          let chapter = chapterlist[0];
          if (sort.get(chapter) === 'full') { reference += `${chapter}–`; startfull = true; }
          else if (partials.get(chapter)?.size === 1) {
            reference += `${chapter}.${first(partials.get(chapter))}–`; startfull = false;
          }
          chapter = chapterlist[chapterlist.length - 1];
          if (!startfull) {
            if ((partials.get(chapter)?.size || 0) > 1) reference += `${chapter}.${max(book, chapter)};`;
            else {
              const lastverse = partials.get(chapter) ? last(partials.get(chapter)) : last(last(chapters.get(chapter)));
              reference += `${chapter}.${lastverse};`;
            }
          }
          if (startfull) {
            if (endfull) reference += `${chapter};`;
            else reference += `${chapter}.${partials.get(chapter) ? last(partials.get(chapter)) : ''};`;
          }
        }
        continue;
      }

      for (const [chapter, blocks] of chapters) {
        if (chapterCount > 0) reference += '; ';
        reference += `${chapter};`;
        let blockCount = 0;
        for (const verses of blocks.values()) {
          let colon = ':';
          if (blockCount > 0) { reference += ','; colon = ''; }
          const chmax = max(book, chapter);
          const vs = [...verses.values()];
          const lo = Math.min(...vs), hi = Math.max(...vs);
          if (lo === hi) reference += `${colon}${lo}`;
          else if (lo === 1 && hi === chmax) reference += '';
          else reference += `${colon}${lo}-${hi}`;
          blockCount++;
        }
        chapterCount++;
      }
      bookCount++;
    }
    segCount++;
  }

  // Collapse runs of consecutive chapters ("Gen 1; 2; 3; 4;" → "Gen 1–4;")
  const chapterNums = [...(reference + ';').matchAll(/\s(\d+);/g)].map(m => m[1]);
  const replace = new Map();
  let ri = 0, prev;
  chapterNums.forEach((chapter, key) => {
    const c = Number(chapter);
    const next = chapterNums[key + 1] !== undefined ? Number(chapterNums[key + 1]) : 0;
    if (c === (prev ?? 0) + 1 && c === next - 1) replace.set(ri, (replace.get(ri) || '') + `; ${chapter}`);
    else ri++;
    prev = c;
  });
  for (const rep of replace.values()) reference = reference.replace(new RegExp(`${pregQuote(rep)}; `), '–');

  // PHP's str_replace($clean_from, $clean_to) with $clean_to unset deletes these matches
  for (const m of [...reference.matchAll(/[a-z]+\s*(\d+);\s*(\d+)/g)]) {
    if (Number(m[2]) - Number(m[1]) === 1) reference = reference.split(m[0]).join('');
  }

  reference = reference.replace(/-/g, '–')
    .replace(/(;\s*)+/g, '; ')
    .replace(/;\s*:/g, ':')
    .replace(/[; ]+$/, '')
    .replace(/^[;]+/, '')
    .trim();

  const segs = reference.split('; ');
  if (segs.length > 1) {
    let lastbook = '';
    reference = segs.map(s => {
      const m = s.match(/^(\d*.*[a-z].*?)*(\d.*$)/i) || [];
      const book = (m[1] || '').trim();
      const r = (m[2] || '').trim();
      const dbook = book === lastbook ? '' : book;
      if (book) lastbook = book;
      return `${dbook} ${r}`;
    }).join('; ');
  }

  return reference.replace(/\b(Tao( Te Ching)*.*\d+):1\b/, '$1');
}
