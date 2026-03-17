import VerseSerializer from '../serializers/VerseSerializer.js';

// Mirrors PHP scriptutil::versionIMG($ver, $verses)
function versionIMG(version, volume) {
  if (version === 'LDS') {
    if (volume === 'OT' || volume === 'NT') return 'ldskjv';
    if (volume === 'BOM') return 'lds-bom2';
    if (volume === 'DC') return 'lds-dc2';
    if (volume === 'POGP') return 'lds-pgp2';
  }
  return version.replace(/\*.*$/, '').toLowerCase();
}

export class HtmlPresenter {
  present(result, req, res) {
    const data = this.serialize(result);
    res.render('scripture', {
      data,
      config: result.config,
      title: result.reference.normalized || 'Scripture Guide'
    });
  }

  serialize(result) {
    const version = result.config.version || 'KJV';
    const img = versionIMG(version, result.reference.volume);
    const chapterHeadVerseId = result.chapterHeading?.verse_id;

    // Build verse_id → verse_num map for range computation
    const verseNumMap = {};
    for (const v of result.verses) {
      verseNumMap[v.id] = v.verseNum;
    }
    const passageLastVerseId = result.verses.length ? result.verses[result.verses.length - 1].id : 0;

    // Track verse_ids that start a new section mid-verse (have §¶ in text, i.e. multi-segment)
    // When the next heading starts at such a verse, the current heading's range includes it
    const midSectionVerseIds = new Set();
    for (const v of result.verses) {
      if (VerseSerializer.splitSegments(v.text).length > 1) midSectionVerseIds.add(v.id);
    }

    // Collect all 'heading' type records, sorted, with range computation
    // These will be rendered as full h3 elements with all attrs
    const h3Headings = result.headings
      .filter(h => h.type === 'heading')
      .sort((a, b) => a.verse_id - b.verse_id);

    const passageLastVerseNum = result.verses.length ? result.verses[result.verses.length - 1].verseNum : null;

    h3Headings.forEach((h) => {
      // last_verse_id from DB self-join (global next heading - 1)
      h.last = h.last_verse_id || passageLastVerseId;
      // Synthetic chapter headings count inclusively (last - first + 1); section headings exclusive
      h.verse_count = h.synthetic ? (h.last - h.verse_id + 1) : (h.last - h.verse_id);
      h.firstVerseNum = verseNumMap[h.verse_id];
      // If the next verse after h.last starts a new section mid-verse (§¶), include its verse number
      // This mirrors PHP behavior where the current section "owns" the first part of that verse
      const nextMid = midSectionVerseIds.has(h.last + 1) ? verseNumMap[h.last + 1] : undefined;
      h.lastVerseNum = nextMid ?? verseNumMap[h.last] ?? passageLastVerseNum;
      h.img = img;
      h.ver = version;
      h.tver = version;
      // parallel is attached by ScriptureLookupService if significant cross-refs exist
    });

    // Build book slug for h3 slug attrs: use book_title (e.g. "doctrine.and.covenants"), not lds_org
    const bookTitle = result.chapterHeading?.bookTitle || result.chapterHeading?.bookSlug || '';
    const bookSlugForH3 = bookTitle.toLowerCase().replace(/\s+/g, '.');
    const chapter = result.reference.chapter;

    // Assign slug/ref/headless to each h3 heading
    h3Headings.forEach(h => {
      if (bookSlugForH3 && chapter) {
        if (h.synthetic) {
          // Synthetic chapter heading: no verse range in slug/ref, headless="1"
          h.slug = `${version}/${bookSlugForH3}.${chapter}`;
          h.ref = `${result.reference.book || ''} ${chapter}`;
          h.headless = true;
        } else {
          const f = h.firstVerseNum;
          const l = h.lastVerseNum;
          const verseRange = (f && l && f !== l) ? `.${f}-${l}` : (f ? `.${f}` : '');
          h.slug = `${version}/${bookSlugForH3}.${chapter}${verseRange}`;
          // ref: "Book Chapter:first–last" with en-dash
          const bookName = result.reference.book || '';
          h.ref = (f && l && f !== l) ? `${bookName} ${chapter}:${f}\u2013${l}` : `${bookName} ${chapter}:${f || ''}`;
        }
      }
    });

    // Index h3 headings by verse_id for EJS lookup
    const h3ByVerse = {};
    for (const h of h3Headings) {
      h3ByVerse[h.verse_id] = h;
    }

    // Pre-passage heading: when chapterHeading has actual section heading text AND verse_id < firstVerseId,
    // PHP renders that section heading as the chapter-level h3 (with ellipsis below it) and does NOT
    // render any heading at firstVerseId (inline or synthetic) as a separate h3.
    // Condition: chapterHeading.heading field must exist (not just a 'title' type record like "Psalms").
    // This handles: NRSV Ps.23 (prior section spans chapters), NRSV Isa.53 (heading a few verses before).
    // Does NOT apply: KJV Ps.23 (chapterHeading is just a book 'title' with no .heading field).
    // Does NOT apply: NRSV John.18 (isNewSection=true makes chapterHeading.verse_id === firstVerseId).
    let prePassageH3 = null;
    if (result.chapterHeading?.heading && passageLastVerseId && result.chapterHeading.verse_id < (result.verses[0]?.id ?? Infinity)) {
      const ch = result.chapterHeading;
      const firstVId = result.verses[0]?.id;
      // Use the DB heading's own last_verse_id (the range it covers in the DB),
      // not the passage end — verse_count and last_verse_id attrs reference the DB range
      const chLast = ch.last ?? passageLastVerseId;
      const chVerseCount = chLast - ch.verse_id;
      prePassageH3 = {
        verse_id: ch.verse_id,
        text: ch.heading || '',
        ref: `${result.reference.book || ''} ${chapter}`,
        slug: bookSlugForH3 && chapter ? `${version}/${bookSlugForH3}.${chapter}` : '',
        verse_count: chVerseCount,
        last: chLast,
        // Ellipsis p attrs mirror the h3 attrs
        ellipsisVerseCount: chVerseCount + 1,
        ellipsisLast: chLast,
        headless: false,
        img,
        ver: version,
        tver: version,
        audio: ch.audio === 1 ? 1 : 0
      };
      // Remove inline heading at firstVerseId — production doesn't render it when pre-passage h3 takes its place
      delete h3ByVerse[firstVId];
    }

    // Non-heading inline elements (verse_head, summary, headnote, background)
    // Exclude summary/headnote/background for the chapter heading verse (rendered after chapter h3)
    const chapterTypes = new Set(['summary', 'headnote', 'background']);
    const inlineByVerse = {};
    for (const h of result.headings) {
      if (h.type === 'heading') continue; // handled separately via h3ByVerse
      if (h.verse_id === chapterHeadVerseId && chapterTypes.has(h.type)) continue;
      if (!inlineByVerse[h.verse_id]) inlineByVerse[h.verse_id] = [];
      inlineByVerse[h.verse_id].push(h);
    }

    return {
      reference: result.reference.normalized,
      query: result.reference.query,
      volume: result.reference.volume,
      version,
      chapter,
      book: result.reference.book,
      verseCount: result.verseCount,
      verses: result.verses.flatMap(v => {
        const segments = VerseSerializer.splitSegments(v.text);
        return segments.flatMap((seg, i) => {
          const lbParts = VerseSerializer.splitLinebreaks(seg.text);
          // Format override rules:
          // - If segment text starts with §, it's a subtitle/heading line → always prose
          // - If segment meta contains ▼ (preceded by ¶▼), next segment is poetry
          // - If segment meta contains ► (preceded by ¶►), next segment is indent
          // - Otherwise use DB verse format
          let segFormat;
          if (seg.text.startsWith('§')) {
            segFormat = 'prose';
          } else if (seg.meta.includes('▼')) {
            segFormat = 'poetry';
          } else if (seg.meta.includes('►')) {
            segFormat = 'indent';
          } else {
            segFormat = v.format || 'prose';
          }
          return lbParts.map((part, lbIdx) => ({
            id: v.id,
            num: v.verseNum,
            text: VerseSerializer.formatHtml(part.text),
            format: segFormat,
            lbClass: part.lbClass,
            version: v.version,
            // Break paragraph if first linebreak part: meta has ¶, or single-segment verse with DB paraBreak
            paraBreak: lbIdx === 0 && (seg.meta.includes('¶') || (i === 0 && segments.length === 1 && v.paraBreak)),
            // §¶ in meta means this segment triggers the section heading for this verse_id
            isSection: lbIdx === 0 && /^§/.test(seg.meta),
            segIndex: i,
            segCount: segments.length,
            lbIndex: lbIdx
          }));
        });
      }),
      h3ByVerse,       // full h3 headings indexed by verse_id
      inlineByVerse,   // non-heading inline elements indexed by verse_id
      prePassageH3,    // chapter heading from prior section (renders before verses with ellipsis)
      // Keep headings for backward compat (partials/passage.ejs)
      headings: Object.fromEntries(
        Object.entries(h3ByVerse).map(([k, v]) => [k, [v]])
      ),
      chapterHeading: result.chapterHeading,
      chapterNav: result.chapterNav,
      img,
      chapterSlug: bookSlugForH3 && chapter ? `${version}/${bookSlugForH3}.${chapter}` : null,
      audio: result.chapterHeading?.audio === 1 ? 1 : 0,
      canonicalRefSlug: result.config._canonicalRefSlug || ''
    };
  }
}

export default HtmlPresenter;
