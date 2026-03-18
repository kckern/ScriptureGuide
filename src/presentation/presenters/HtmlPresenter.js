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
    const title = result.reference.normalized || 'Scripture Guide';
    const ogMeta = this._buildOgMeta(result, data, title, req);
    res.render('scripture', {
      data,
      config: result.config,
      title,
      ogMeta
    });
  }

  _buildOgMeta(result, data, title, req) {
    const version = result.config.version || 'LDS';
    const img = data.img || version.toLowerCase();
    const ch = result.chapterHeading;

    // Build description: "{title}— {summary/heading}. {first verse text...}"
    // Build description: "{title}— {summary/heading} {first verse text...}"
    let description = title;
    const descriptor = ch?.summary || ch?.heading;
    if (descriptor) description += '— ' + descriptor;
    // Append verse text until we reach ~1000 chars
    const prefix = descriptor ? ' ' : '— ';
    let addedVerses = false;
    for (const v of result.verses) {
      const plain = v.text.replace(/^[§¶]+/, '').replace(/｟([^｠]*)｠/g, '$1').replace(/\s+/g, ' ').trim();
      description += (addedVerses ? ' ' : prefix) + plain;
      addedVerses = true;
      if (description.length >= 1000) break;
    }
    description = description.substring(0, 1000);

    const host = (req?.headers?.host || 'scripture.guide').replace(/:\d+$/, '');
    const path = req?.path || '/';
    return {
      title: `${title} | Scripture Guide`,
      image: `http://cover.scripture.guide/${img}`,
      description,
      url: `http://${host}${path}`
    };
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
      const segs = VerseSerializer.splitSegments(v.text);
      // Only include verses where §¶ appears MID-TEXT: first segment has no § (previous-section content)
      if (segs.length > 1 && !segs[0].meta.includes('§')) midSectionVerseIds.add(v.id);
    }

    // Collect all 'heading' type records, sorted, with range computation
    // These will be rendered as full h3 elements with all attrs
    const h3Headings = result.headings
      .filter(h => h.type === 'heading')
      .sort((a, b) => a.verse_id - b.verse_id);

    const passageLastVerseNum = result.verses.length ? result.verses[result.verses.length - 1].verseNum : null;

    h3Headings.forEach((h, i) => {
      // last_verse_id from DB self-join (global next heading - 1)
      h.last = h.last_verse_id || passageLastVerseId;
      // Synthetic/preSectionSynthetic chapter headings count inclusively (last - first + 1); section headings exclusive
      h.verse_count = (h.synthetic || h.preSectionSynthetic) ? (h.last - h.verse_id + 1) : (h.last - h.verse_id);
      // Synthetic sub-chapter: display attrs use the chapter-level range (not the requested verse range).
      // E.g. john.3.16 → heading_verse_id=chapter_start, verse_count=36, last_verse_id=chapter_end.
      // ref/slug are still computed from the actual verse range below (not overridden here).
      if (h.synthetic && !h._wholeChapter && h._chapterVerseId != null) {
        const chLast = h._chapterLast ?? h.last;
        h.displayVerseId = h._chapterVerseId;
        h._displayLast = chLast;
        h._displayVerseCount = chLast - h._chapterVerseId + 1;
      }
      // Adjacent heading continuation: when this heading starts at (prevHeading.last + 1) AND
      // prevHeading.last is a MISSING verse (not in verseNumMap, e.g. NRSV James 1:8 absent),
      // PHP renders this heading with the previous heading's display attrs (verse_id/verse_count/last)
      // but computes a new ref/slug for this heading's actual verse range.
      const prev = h3Headings[i - 1];
      const prevLast = prev && (prev._origLast ?? prev.last);
      if (prev && !h.synthetic && !h.preSectionSynthetic &&
          h.verse_id === prevLast + 1 && verseNumMap[prevLast] == null) {
        h.displayVerseId = prev.displayVerseId ?? prev.verse_id;
        h._displayVerseCount = prev._displayVerseCount ?? prev.verse_count;
        h._displayLast = prev._displayLast ?? prev.last;
      }
      // Store original last for adjacency detection (may be needed by the next heading)
      h._origLast = h.last_verse_id || passageLastVerseId;
      h.firstVerseNum = verseNumMap[h.verse_id];
      // If the next verse after h.last starts a new section mid-verse (§¶), include its verse number
      // This mirrors PHP behavior where the current section "owns" the first part of that verse
      const nextMid = midSectionVerseIds.has(h.last + 1) ? verseNumMap[h.last + 1] : undefined;
      // Fallback to h.last-1 in case h.last is not in verseNumMap (data gap: verse missing from this version)
      h.lastVerseNum = nextMid ?? verseNumMap[h.last] ?? verseNumMap[h.last - 1] ?? passageLastVerseNum;
      // preSectionSynthetic: override lastVerseNum to the verse just before the first real heading
      // so that ref/slug say "1:1" (verse 1 only), while verse_count/last_verse_id span the full chapter
      if (h.preSectionSynthetic && h._sectionLast) {
        h.lastVerseNum = verseNumMap[h._sectionLast] ?? passageLastVerseNum;
      }
      h.img = img;
      h.ver = version;
      h.tver = version;
      // Audio: apply chapter-level audio to all h3s (PHP computes per-section but result is same for whole chapter)
      h.audio = result.chapterHeading?.audio > 0 ? 1 : 0;
      // parallel is attached by ScriptureLookupService if significant cross-refs exist
    });

    // Build book slug for h3 slug attrs: use book_title (e.g. "doctrine.and.covenants"), not lds_org
    const bookTitle = result.chapterHeading?.bookTitle || result.chapterHeading?.bookSlug || result.config._bookTitle || '';
    const bookSlugForH3 = bookTitle.toLowerCase().replace(/\s+/g, '.');
    const chapter = result.reference.chapter;

    // Build verse_id → chapter map: use canonical map from ScriptureLookupService (covers all
    // verse_ids including heading-only ones not in scripture_verses), fallback to Verse.chapter
    const vChapterMap = Object.assign({}, result.config._vChapterMap || {});
    for (const v of result.verses) {
      if (v.chapter != null && vChapterMap[v.id] == null) vChapterMap[v.id] = v.chapter;
    }

    // Sub-chapter request: reference has explicit verse(s) (e.g. john.3.16, isa.53.1-6)
    const isSubChapterRequest = result.reference.normalized?.includes(':') ?? false;

    // Cross-chapter request: e.g. "Genesis 1:1-2:3" → format as chapter-range slug
    // Captures: [_, startVerse, endChap, endVerse] from normalized like "Genesis 1:1-2:3"
    const crossChapterMatch = result.reference.normalized?.match(/:(\d+)-(\d+):(\d+)/);

    // Assign slug/ref/headless to each h3 heading
    h3Headings.forEach(h => {
      // Per-h3 chapter: use heading's own _chapterNum (multi-chapter synthetic),
      // or look up the heading verse's chapter from the vChapterMap (inline headings),
      // falling back to reference.chapter (single-chapter requests).
      const h3Chapter = h._chapterNum ?? chapter ?? vChapterMap[h.verse_id];
      if (bookSlugForH3 && h3Chapter) {
        const bookName = result.reference.book || '';
        // All synthetic headings are headless
        if (h.synthetic) h.headless = true;
        // Whole-chapter heading (synthetic full-chapter OR single real section spanning whole chapter):
        // use chapter-level slug/ref (no verse range)
        const isChapterLevel = (h.synthetic && h._wholeChapter) || (h._wholeChapter && !h.synthetic && !h.preSectionSynthetic);
        if (isChapterLevel) {
          // Check if the whole-chapter heading spans multiple chapters (e.g. NRSV Ps.22-23 single section)
          const hLastChap = vChapterMap[h.last] ?? h3Chapter;
          if (hLastChap !== h3Chapter) {
            h.slug = `${version}/${bookSlugForH3}.${h3Chapter}-${hLastChap}`;
            h.ref = `${bookName} ${h3Chapter}\u2013${hLastChap}`;
          } else {
            h.slug = `${version}/${bookSlugForH3}.${h3Chapter}`;
            h.ref = `${bookName} ${h3Chapter}`;
          }
        } else if (crossChapterMatch && h.verse_id <= (result.verses[0]?.id ?? 0) + 1) {
          // Cross-chapter range (e.g. "Genesis 1:1-2:3"): format as chapter-range slug
          // This applies to the heading at the start of the passage that spans multiple chapters.
          const startVerse = parseInt(crossChapterMatch[1]);
          const endChap = parseInt(crossChapterMatch[2]);
          const endVerse = parseInt(crossChapterMatch[3]);
          if (startVerse === 1) {
            h.slug = `${version}/${bookSlugForH3}.${h3Chapter}-${endChap}.${endVerse}`;
            h.ref = `${bookName} ${h3Chapter}\u2013${endChap}.${endVerse}`;
          } else {
            h.slug = `${version}/${bookSlugForH3}.${h3Chapter}.${startVerse}-${endChap}.${endVerse}`;
            h.ref = `${bookName} ${h3Chapter}:${startVerse}\u2013${endChap}.${endVerse}`;
          }
        } else {
          const f = h.firstVerseNum;
          const l = h.lastVerseNum;
          // Detect cross-chapter section headings (e.g. NRSV Gen 1:1–2:4, Isa 52:13–53:12).
          // vChapterMap only contains chapters for verses in the current passage, so if h.last is
          // beyond the passage it won't be in the map and we safely fall back to h3Chapter (no false trigger).
          const hLastChapter = vChapterMap[h.last] ?? h3Chapter;
          if (hLastChapter !== h3Chapter) {
            // Cross-chapter section heading: use chapter-range ref/slug format
            const endChap = hLastChapter;
            // Use h.lastVerseNum (computed above with nextMid extension) as the end verse number
            const endVerse = h.lastVerseNum ?? verseNumMap[h.last];
            if (f === 1) {
              // Starts at verse 1: compact format (no starting verse in slug/ref)
              h.slug = `${version}/${bookSlugForH3}.${h3Chapter}-${endChap}.${endVerse}`;
              h.ref = `${bookName} ${h3Chapter}\u2013${endChap}.${endVerse}`;
            } else {
              h.slug = `${version}/${bookSlugForH3}.${h3Chapter}.${f}-${endChap}.${endVerse}`;
              h.ref = `${bookName} ${h3Chapter}:${f}\u2013${endChap}:${endVerse}`;
            }
          } else {
            // Normal single-chapter section: compute verse range within this chapter
            // Using verseNum bounds ensures mid-section boundary verse is included (e.g. John 18:38)
            // and handles missing-verse gaps (e.g. NRSV Mark 15:28 absent → [21-27,29-32]).
            // Scope by chapter to avoid matching duplicate verse numbers from adjacent chapters.
            const sectionVerseNums = (f != null && l != null) ? result.verses
              .filter(v => v.id >= h.verse_id && v.verseNum != null && v.verseNum >= f && v.verseNum <= l &&
                (h3Chapter == null || v.chapter == null || v.chapter === h3Chapter))
              .map(v => v.verseNum) : [];
            let verseRangeSlug, refVerse;
            if (sectionVerseNums.length > 0) {
              // Build contiguous ranges from actual verse numbers (handles gaps)
              const segs = [];
              let s = sectionVerseNums[0], e = sectionVerseNums[0];
              for (let i = 1; i < sectionVerseNums.length; i++) {
                if (sectionVerseNums[i] === e + 1) { e = sectionVerseNums[i]; }
                else { segs.push(s === e ? `${s}` : `${s}-${e}`); s = e = sectionVerseNums[i]; }
              }
              segs.push(s === e ? `${s}` : `${s}-${e}`);
              if (segs.length > 1) {
                // Non-contiguous: use comma-separated format (with en-dashes within ranges)
                verseRangeSlug = `.${segs.join(',')}`;
                refVerse = segs.map(seg => seg.replace('-', '\u2013')).join(',');
              } else {
                verseRangeSlug = segs[0] === `${f}` ? `.${f}` : `.${segs[0]}`;
                refVerse = segs[0].replace('-', '\u2013');
              }
            } else {
              verseRangeSlug = (f && l && f !== l) ? `.${f}-${l}` : (f ? `.${f}` : '');
              refVerse = (f && l && f !== l) ? `${f}\u2013${l}` : `${f || ''}`;
            }
            h.slug = `${version}/${bookSlugForH3}.${h3Chapter}${verseRangeSlug}`;
            h.ref = `${bookName} ${h3Chapter}:${refVerse}`;
          }
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
      const bookName = result.reference.book || '';
      // Choose ref/slug format based on section coverage:
      // - chLast < firstVId: section ends before passage → chapter-level (e.g. Ps.23)
      // - chLast >= firstVId && chLast < passageLastVerseId: partial overlap → verse-level (e.g. Gen.2)
      // - chLast >= passageLastVerseId: section spans full passage → chapter-level (e.g. Isa.53)
      let preH3Ref, preH3Slug;
      if (chLast >= firstVId && chLast < passageLastVerseId && bookSlugForH3 && chapter) {
        const firstVNum = verseNumMap[firstVId];
        // lastVNum: if chLast+1 is a mid-section verse (§¶ mid-text, part of this section), include it.
        // Otherwise use chLast (inclusive end). Mirrors the regular h3 nextMid/lastVerseNum logic.
        const nextMidPre = midSectionVerseIds.has(chLast + 1) ? verseNumMap[chLast + 1] : undefined;
        const lastVNum = nextMidPre ?? verseNumMap[chLast] ?? verseNumMap[chLast - 1];
        const verseRange = (firstVNum && lastVNum && firstVNum !== lastVNum)
          ? `.${firstVNum}-${lastVNum}` : (firstVNum ? `.${firstVNum}` : '');
        preH3Slug = `${version}/${bookSlugForH3}.${chapter}${verseRange}`;
        preH3Ref = (firstVNum && lastVNum && firstVNum !== lastVNum)
          ? `${bookName} ${chapter}:${firstVNum}\u2013${lastVNum}`
          : `${bookName} ${chapter}:${firstVNum || ''}`;
      } else if (isSubChapterRequest && bookSlugForH3 && chapter) {
        // Sub-chapter request: section covers full passage — use passage verse range for ref/slug
        const firstVNum = verseNumMap[firstVId];
        const lastVNum = verseNumMap[passageLastVerseId];
        const verseRange = (firstVNum && lastVNum && firstVNum !== lastVNum)
          ? `.${firstVNum}-${lastVNum}` : (firstVNum ? `.${firstVNum}` : '');
        preH3Slug = `${version}/${bookSlugForH3}.${chapter}${verseRange}`;
        preH3Ref = (firstVNum && lastVNum && firstVNum !== lastVNum)
          ? `${bookName} ${chapter}:${firstVNum}\u2013${lastVNum}`
          : `${bookName} ${chapter}:${firstVNum || ''}`;
      } else {
        // Chapter-level (or full-passage) heading. For multi-chapter requests, determine the actual
        // chapter range from vChapterMap since reference.chapter is null.
        const preStartChap = chapter ?? vChapterMap[ch.verse_id] ?? vChapterMap[firstVId];
        const preEndChap = passageLastVerseId ? (vChapterMap[passageLastVerseId] ?? preStartChap) : preStartChap;
        if (preStartChap && preEndChap && preEndChap !== preStartChap) {
          preH3Ref = `${bookName} ${preStartChap}\u2013${preEndChap}`;
          preH3Slug = bookSlugForH3 ? `${version}/${bookSlugForH3}.${preStartChap}-${preEndChap}` : '';
        } else {
          const chToUse = preStartChap ?? chapter;
          preH3Ref = `${bookName} ${chToUse}`;
          preH3Slug = bookSlugForH3 && chToUse ? `${version}/${bookSlugForH3}.${chToUse}` : '';
        }
      }
      prePassageH3 = {
        verse_id: ch.verse_id,
        text: ch.heading || '',
        ref: preH3Ref,
        slug: preH3Slug,
        verse_count: chVerseCount,
        last: chLast,
        // Ellipsis p attrs: ellipsisVerseCount = omitted verses before firstVId
        ellipsisVerseCount: firstVId - ch.verse_id,
        ellipsisLast: chLast,
        headless: false,
        img,
        ver: version,
        tver: version,
        audio: ch.audio > 0 ? 1 : 0,
        parallel: ch._prePassageParallel || null
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
      audio: result.chapterHeading?.audio > 0 ? 1 : 0,
      canonicalRefSlug: result.config._canonicalRefSlug || ''
    };
  }
}

export default HtmlPresenter;
