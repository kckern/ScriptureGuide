import VerseSerializer from '../serializers/VerseSerializer.js';
import { displayReference, blankHeading } from '../../domain/rules/referenceParsing.js';

import { versionImg, formatReference as referenceFromVerseIds, splitRuns } from '../../domain/rules/legacyReference.js';
import { isEmptyRange } from '../../domain/rules/blockIds.js';
import { renderHeadingHtml, renderHeadingFields, RENDERED_HEADING_FIELDS, segmentFormats, escapeHtml, isCompoundLine } from '../../domain/rules/legacyText.js';

// versionImg takes lds_scriptures_volumes.volume_id; Reference.volume is a volume code.
// Verses outside the five volumes (null) have no LDS cover: 0 gives "lds".
const VOLUME_IDS = { OT: 1, NT: 2, BOM: 3, DC: 4, POGP: 5 };
const volumeId = volume => VOLUME_IDS[volume] ?? 0;

// scriptures::formattedData: a line of exactly "*" (2HRBOM, CTBOM, EARLIEST ...) is a verse merged
// into the line before it. That line gets compound="N", the merged reference
// (referenceFromVerseIds with book_title_short, "1 Ne. 1:1–3") and its verses as the label ("1–3").
export function foldCompounds(lines, bookShort) {
  const out = [];
  let host = null;
  let merged = null; // verse_id → { book, bookId, chapter, verse } of the host and its merged verses
  const at = line => ({ book: bookShort, bookId: 0, chapter: line.chapter, verse: line.num });
  for (const line of lines) {
    if (!isCompoundLine(line.text) || !host) {
      out.push(line);
      host = line;
      merged = new Map([[line.id, at(line)]]);
      continue;
    }
    merged.set(line.id, at(line));
    host.gapIds = [...(host.gapIds || []), line.id];
    host.lastNum = line.num;
    host.compound = merged.size;
    host.compoundRef = referenceFromVerseIds([...merged.keys()], merged, () => null);
    host.compoundLabel = host.compoundRef.replace(/^.*?:/, '');
  }
  return out;
}

export class HtmlPresenter {
  present(result, req, res) {
    const data = this.serialize(result);
    // No verses: the title is the reference as requested (index.php); a page built from the PHP
    // blocks carries its own (ScriptureController.notFoundPage)
    const title = result.title ?? (data.title || req?.config?.reference || result.reference.query || '');
    const ogMeta = this._buildOgMeta(result, data, title, req);
    const sections = result.sections ? result.sections.map(r => this.serialize(r)) : null;
    res.render('scripture', {
      data,
      sections,
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
    const img = versionImg(version, volumeId(result.reference.volume));
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
        } else if (crossChapterMatch && h.verse_id <= (result.verses[0]?.id ?? 0) + 1 &&
            (vChapterMap[Math.min(h.last, passageLastVerseId)] ?? h3Chapter) !== h3Chapter) {
          // Cross-chapter range (e.g. "Genesis 1:1-2:3"): format as chapter-range slug
          // This applies to the heading at the start of the passage that spans multiple chapters.
          const startVerse = parseInt(crossChapterMatch[1]);
          const endChap = parseInt(crossChapterMatch[2]);
          const endVerse = parseInt(crossChapterMatch[3]);
          if (startVerse === 1) {
            h.slug = `${version}/${bookSlugForH3}.${h3Chapter}-${endChap}.${endVerse}`;
            h.ref = `${bookName} ${h3Chapter}\u2013${endChap}:${endVerse}`;
          } else {
            h.slug = `${version}/${bookSlugForH3}.${h3Chapter}.${startVerse}-${endChap}.${endVerse}`;
            h.ref = `${bookName} ${h3Chapter}:${startVerse}\u2013${endChap}:${endVerse}`;
          }
        } else {
          const f = h.firstVerseNum;
          const l = h.lastVerseNum;
          // Detect cross-chapter section headings (e.g. NRSV Gen 1:1–2:4, Isa 52:13–53:12).
          // vChapterMap only contains chapters for verses in the current passage, so if h.last is
          // beyond the passage it won't be in the map and we safely fall back to h3Chapter (no false trigger).
          const hLastChapter = vChapterMap[h.last] ?? h3Chapter;
          // Verses that skip chapters ("John 3:16; 4:2"): one part per run
          const runs = hLastChapter !== h3Chapter ? splitRuns(result.verses
            .filter((v, i, all) => v.id >= h.verse_id && v.id <= h.last && v.id !== all[i - 1]?.id)
            .map(v => ({ id: v.id, chapter: vChapterMap[v.id] ?? v.chapter, verse: v.verseNum }))) : null;
          if (runs) {
            h.slug = `${version}/${bookSlugForH3}.${runs.slug}`;
            h.ref = `${bookName} ${runs.ref}`;
          } else if (hLastChapter !== h3Chapter) {
            // Cross-chapter section heading: use chapter-range ref/slug format
            const endChap = hLastChapter;
            // Use h.lastVerseNum (computed above with nextMid extension) as the end verse number
            const endVerse = h.lastVerseNum ?? verseNumMap[h.last];
            if (f === 1) {
              // Starts at verse 1: compact format (no starting verse in slug/ref)
              h.slug = `${version}/${bookSlugForH3}.${h3Chapter}-${endChap}.${endVerse}`;
              h.ref = `${bookName} ${h3Chapter}\u2013${endChap}:${endVerse}`;
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

    // Format override ("/niv*kjv/..."): headings loaded from the format version link as TEXT*FORMAT
    const headingVersion = result.config.headingVersion;
    const mixVer = headingVersion && headingVersion !== version ? `${version}*${headingVersion}` : null;
    if (mixVer) {
      for (const h of h3Headings) {
        if (h.synthetic || h.preSectionSynthetic || !h.text) continue;
        h.ver = mixVer;
        h.headVersion = headingVersion;
        if (h.slug) h.slug = h.slug.replace(/^[^/]+\//, `${mixVer}/`);
      }
    }

    // Index h3 headings by verse_id for EJS lookup
    const h3ByVerse = {};
    // Subheadings by verse_id: shown under their heading (buildHeading)
    const subheadings = {};
    for (const h of result.headings) if (h.type === 'subheading' && h.text) subheadings[h.verse_id] = h.text;
    const headingHtml = (text, sub) => renderHeadingHtml(text) + (sub ? `<br/><small>${renderHeadingHtml(sub)}</small>` : '');
    for (const h of h3Headings) {
      // Heading text as the page shows it (renderHeadingHTML); h.text stays as stored
      h.textHtml = headingHtml(h.text, subheadings[h.verse_id]);
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
      // Detect cross-chapter boundary: chLast is in a different chapter from firstVId.
      // e.g. Ps.21 heading (chLast=14205=Ps.21:13) before Ps.22 passage (firstVId=14206=Ps.22:1).
      // vs. Mark 16 heading (chLast=24882=Mk16:8) before Mk 16:9-20 (firstVId=24883=Mk16:9).
      // Use ch._lastChapter (fetched in ScriptureLookupService, stored on heading object, NOT in vChapterMap
      // to avoid polluting vChapterMap with verse_ids outside the passage).
      const chLastChapter = ch._lastChapter ?? null;
      const firstVIdChapter = vChapterMap[firstVId];
      const isCrossChapterBoundary = chLast < firstVId && chLastChapter != null && firstVIdChapter != null && chLastChapter !== firstVIdChapter;
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
      } else if (chLast < firstVId && !isCrossChapterBoundary && isSubChapterRequest && bookSlugForH3 && chapter) {
        // Sub-chapter request: section ends before passage, same chapter (e.g. mark.16.9-20).
        // Use just the first verse of the passage as ref/slug (mirrors PHP behavior).
        const firstVNum = verseNumMap[firstVId];
        preH3Slug = firstVNum ? `${version}/${bookSlugForH3}.${chapter}.${firstVNum}` : '';
        preH3Ref = firstVNum ? `${bookName} ${chapter}:${firstVNum}` : '';
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
      if (mixVer && preH3Slug) preH3Slug = preH3Slug.replace(/^[^/]+\//, `${mixVer}/`);
      prePassageH3 = {
        verse_id: ch.verse_id,
        text: ch.heading || '',
        textHtml: headingHtml(ch.heading, ch.subheading),
        ref: preH3Ref,
        slug: preH3Slug,
        verse_count: chVerseCount,
        last: chLast,
        // Ellipsis p attrs: ellipsisVerseCount = omitted verses before firstVId
        ellipsisVerseCount: firstVId - ch.verse_id,
        ellipsisLast: chLast,
        headless: false,
        img,
        ver: mixVer || version,
        headVersion: mixVer ? headingVersion : undefined,
        tver: version,
        audio: ch.audio > 0 ? 1 : 0,
        parallel: ch._prePassageParallel || null
      };
      // Remove inline heading at firstVerseId when the section overlaps with the passage,
      // OR when the prePassageH3 crosses a chapter boundary (different chapter heading, e.g. Ps.21→Ps.22).
      // When the section ends before the passage AND is from the same chapter (e.g. Mk 16:1-8 before 16:9-20),
      // keep the inline h3 so both the prior section and the current section render.
      if (chLast >= firstVId || isCrossChapterBoundary) {
        delete h3ByVerse[firstVId];
      }
    }

    // Non-heading inline elements (verse_head, summary, headnote, background)
    // Exclude summary/headnote/background for the chapter heading verse (rendered after chapter h3)
    const chapterTypes = new Set(['summary', 'headnote', 'background']);
    const inlineByVerse = {};
    for (const h of result.headings) {
      if (h.type === 'heading') continue; // handled separately via h3ByVerse
      if (h.verse_id === chapterHeadVerseId && chapterTypes.has(h.type)) continue;
      if (h.type === 'verse_head') h.textHtml = renderHeadingHtml(h.text);
      if (!inlineByVerse[h.verse_id]) inlineByVerse[h.verse_id] = [];
      inlineByVerse[h.verse_id].push(h);
    }

    // Heading types (title, summary, headnote, ...) by verse_id, for the header rows of each passage
    const typesByVerse = {};
    for (const h of result.headings) {
      if (h.synthetic || h.preSectionSynthetic || !h.type || h.text == null) continue;
      (typesByVerse[h.verse_id] ??= {})[h.type] = RENDERED_HEADING_FIELDS.includes(h.type) ? renderHeadingHtml(h.text) : h.text;
    }

    return {
      reference: result.reference.normalized,
      // Page title: the reference with en dashes for ranges (PHP referenceFromVerseIds)
      title: displayReference(result.reference.normalized),
      // Heading for a reference block that matched no verses (scriptures::blankData)
      // escaped: it echoes the request (the PHP site reflected it raw)
      blank: result.verses.length ? null : escapeHtml(result.legacyBlock ? result.legacyBlock.orig : blankHeading(result.reference.query)),
      // A multi-book range whose ends matched nothing ([null]): PHP rendered an empty section
      emptySection: !!result.legacyBlock && isEmptyRange(result.legacyBlock),
      startsSection: (result.verses[0]?.text || '').startsWith('§'),
      faxIds: result.config._faxIds || [],
      typesByVerse,
      query: result.reference.query,
      volume: result.reference.volume,
      version,
      chapter,
      book: result.reference.book,
      verseCount: result.verseCount,
      verses: foldCompounds(result.verses.flatMap(v => {
        const segments = VerseSerializer.splitSegments(v.text);
        const formats = segmentFormats(v.format, segments);
        return segments.flatMap((seg, i) => {
          const lbParts = VerseSerializer.splitLinebreaks(seg.text);
          const { format: segFormat, paraClass } = formats[i];
          return lbParts.map((part, lbIdx) => ({
            id: v.id,
            num: v.verseNum,
            chapter: v.chapter,
            mixmatch: v.mixmatch,
            text: VerseSerializer.formatHtml(part.text),
            format: segFormat,
            // Extra class of the paragraph this segment starts ("flush", "linebreak", "nogap")
            paraClass: lbIdx === 0 ? paraClass : '',
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
      }), result.config._bookShort ?? ''),
      h3ByVerse,       // full h3 headings indexed by verse_id
      inlineByVerse,   // non-heading inline elements indexed by verse_id
      prePassageH3,    // chapter heading from prior section (renders before verses with ellipsis)
      chapterHeading: result.chapterHeading,
      // chapterHeading with its title fields rendered (renderHeadingHTML), for the header rows
      chapterHeadingHtml: renderHeadingFields(result.chapterHeading),
      chapterNav: result.chapterNav,
      img,
      chapterSlug: bookSlugForH3 && chapter ? `${version}/${bookSlugForH3}.${chapter}` : null,
      audio: result.chapterHeading?.audio > 0 ? 1 : 0,
      canonicalRefSlug: result.config._canonicalRefSlug || ''
    };
  }
}

export default HtmlPresenter;
