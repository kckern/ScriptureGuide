import referenceService from './ReferenceService.js';
import verseRepository from '../data/repositories/VerseRepository.js';
import headingRepository from '../data/repositories/HeadingRepository.js';
import { Verse } from '../domain/entities/Verse.js';
import { ScriptureResult } from '../domain/entities/ScriptureResult.js';
import { Reference } from '../domain/entities/Reference.js';
import VerseSerializer from '../presentation/serializers/VerseSerializer.js';
import { defaultVersions, versionOrder } from '../domain/rules/defaultVersions.js';
import { applyFormatOverride } from '../domain/rules/formatOverride.js';
import { getBook, splitRuns } from '../domain/rules/legacyReference.js';
import { numericVerseIds, cleanReference } from '../domain/rules/cleanReference.js';
import { parseVerseIdList } from '../domain/rules/referenceParsing.js';
import { isCompoundLine } from '../domain/rules/legacyText.js';
import { wantsChapterNav, chapterNavLinks, sectionNavLinks, sectionRef } from '../domain/rules/chapterNav.js';

// Verse rows grouped by chapter, in order, for one synthetic heading per chapter. A chapter whose
// verses are all "*" lines (merged into an earlier verse: 2HRBOM, CTBOM) joins the run before it.
export function chapterRuns(rows) {
  const chapters = [];
  for (const row of rows) {
    if (row.chapter == null) continue;
    const last = chapters[chapters.length - 1];
    if (last?.chapter === row.chapter) last.rows.push(row);
    else chapters.push({ chapter: row.chapter, rows: [row] });
  }
  const runs = [];
  for (const c of chapters) {
    if (runs.length && c.rows.every(r => isCompoundLine(r.text))) runs[runs.length - 1].rows.push(...c.rows);
    else runs.push(c);
  }
  return runs;
}

export class ScriptureLookupService {
  constructor(refService, verseRepo, headingRepo) {
    this.referenceService = refService;
    this.verseRepository = verseRepo;
    this.headingRepository = headingRepo;
  }

  // Parse a bookSlug.chapter[.verse[-verseEnd]] format (e.g. "song.1", "song.1.3-5")
  // Returns { bookSlug, chapter, verseStart, verseEnd } or null
  static parseSlug(refStr) {
    const m = refStr.match(/^([a-z0-9&]+)\.(\d+)(?:\.(\d+)(?:-(\d+))?)?$/i);
    if (!m) return null;
    return { bookSlug: m[1].toLowerCase(), chapter: parseInt(m[2]), verseStart: m[3] ? parseInt(m[3]) : null, verseEnd: m[4] ? parseInt(m[4]) : null };
  }

  // Split "john.3.16; gen.1.1" into blocks; a block without a book takes the previous one's.
  // After a word that is not a book, a bare number goes with that word (scriptutil::getBook):
  // "corianton; 38" is "corianton 38", not verse id 38.
  splitBlocks(referenceString) {
    const pieces = String(referenceString || '').split(';').map(p => p.trim()).filter(Boolean);
    if (pieces.length < 2) return null;
    const blocks = [];
    let book = null;
    let resolved = false;
    for (const piece of pieces) {
      let text = piece;
      let ref = this.referenceService.parse(text);
      const words = /[a-z]/i.test(piece);
      if (ref.isEmpty && book && (resolved || !words)) {
        text = `${book} ${piece}`;
        ref = this.referenceService.parse(text);
      }
      if (!ref.isEmpty) { book = ref.book; resolved = true; }
      else if (words) { book = getBook(piece, book); resolved = false; }
      blocks.push(text);
    }
    return blocks;
  }

  async lookup(referenceString, config = {}) {
    const blocks = config._block ? null : this.splitBlocks(referenceString);
    if (blocks) {
      // PHP read numbers as verse ids only when the whole reference was numeric
      // (cleanReference); a number among words ("1999; 12; some-words") is not a verse id.
      const idsAllowed = numericVerseIds(referenceString) !== null;
      const sections = [];
      for (const block of blocks) {
        sections.push(await this.lookup(block, { ...config, _block: true, _multiBlock: true, _noVerseIds: !idsAllowed }));
      }
      const found = sections.filter(r => !r.reference.isEmpty);
      const first = found[0] || sections[0];
      return new ScriptureResult({
        reference: new Reference({
          query: referenceString,
          normalized: found.map(r => r.reference.normalized).join('; '),
          verseIds: found.flatMap(r => r.reference.verseIds),
        }),
        verses: found.flatMap(r => r.verses),
        headings: found.flatMap(r => r.headings),
        chapterHeading: first.chapterHeading,
        chapterNav: null,
        annotations: [],
        config: first.config,
        sections,
      });
    }

    let reference = this.referenceService.parse(referenceString);

    // Fallback: if the package doesn't know the book, try DB slug lookup
    if (reference.isEmpty) {
      const slug = ScriptureLookupService.parseSlug(referenceString);
      if (slug) {
        const slugResult = await this.verseRepository.findBySlug(slug.bookSlug, slug.chapter, slug.verseStart, slug.verseEnd);
        if (slugResult) {
          reference = new Reference({
            query: referenceString,
            normalized: `${slugResult.book} ${slug.chapter}${slug.verseStart ? ':' + slug.verseStart + (slug.verseEnd && slug.verseEnd !== slug.verseStart ? '-' + slug.verseEnd : '') : ''}`,
            verseIds: slugResult.verseIds,
            _book: slugResult.book,
            _bookShort: slugResult.bookShort,
            _chapter: slug.chapter
          });
        }
      }
    }

    // Verse ids, JST books and collections the package does not know: the verse index
    if (reference.isEmpty && !(config._noVerseIds && parseVerseIdList(referenceString))) {
      reference = await this.referenceService.resolve(referenceString);
    }

    if (reference.isEmpty) {
      return new ScriptureResult({ reference, verses: [], headings: [], config });
    }

    const verseIds = reference.verseIds;

    // Versions to try, in order: requested ones (LDS last), then defaults by verse range.
    // Text comes from the first version with rows; the verse index is the last resort.
    const requested = config.versions?.length
      ? config.versions
      : (config.version ? [{ version: config.version, format: config.version }] : []);
    const candidates = defaultVersions(versionOrder(requested), verseIds);
    let version = null;
    let headingVersion = null;
    let verseRows = [];
    for (const candidate of candidates) {
      verseRows = await this.verseRepository.findByIds(verseIds, candidate.version);
      if (verseRows.length) {
        version = candidate.version;
        // "TEXT*FORMAT": paragraphing, line format and headings come from the format version
        headingVersion = candidate.format || version;
        if (headingVersion !== version) {
          const formatRows = headingVersion === 'FLAT'
            ? 'FLAT'
            : await this.verseRepository.findFormatRows(verseIds, headingVersion);
          verseRows = applyFormatOverride(verseRows, formatRows, headingVersion);
        }
        break;
      }
    }
    if (!version) {
      version = headingVersion = 'INDEX';
      verseRows = await this.verseRepository.findIndexByIds(verseIds);
    }
    const verses = verseRows.map(row => Verse.fromRow(row));

    // Build verse_id → chapter map from canonical verse table (covers ALL verse_ids, including
    // heading-only ones that have no text entry in scripture_verses for this version, e.g. NRSV Psalms)
    const chapterRows = await this.verseRepository.findChaptersByVerseIds(verseIds);
    const vChapterMap = {};
    for (const row of chapterRows) vChapterMap[row.verse_id] = row.chapter;
    // Also fill from verseRows JOIN result (same data, but ensures consistency for fetched verses)
    for (const row of verseRows) {
      if (row.chapter != null) vChapterMap[row.verse_id] = row.chapter;
    }

    // Fetch inline headings (version-filtered)
    let headings = [];
    let chapterHeading = null;
    let chapterNav = null;

    // Book of the first verse: its short title labels compound verses ("1 Ne. 1:1–3"), with or
    // without headings
    const bookInfo = verseIds.length ? await this.headingRepository.findBookId(verseIds[0]) : null;
    if (bookInfo) config._bookShort = bookInfo.book_title_short;

    if (config.includeHeadings !== false && verseIds.length > 0) {
      headings = await this.headingRepository.findByVerseIds(verseIds, headingVersion);

      const firstVerseId = verseIds[0];
      const lastVerseId = verseIds[verseIds.length - 1];

      if (bookInfo) {
        const { book_id: bookId, lds_org: bookSlug, book_title_short: bookTitleShort, book_title: bookTitle } = bookInfo;
        // PHP loadHeading: if first verse starts with §¶, do NOT decrement verse_id for lookup
        const firstVerseText = verseRows[0]?.text || '';
        const isNewSection = firstVerseText.startsWith('§¶');
        chapterHeading = await this.headingRepository.findChapterHeading(firstVerseId, bookId, headingVersion, isNewSection);
        // PHP tested the cleaned block ("abr.2.1-9.3-4" → "Abraham 2:1-9:3-4") for [,;:]
        if (!config._multiBlock && wantsChapterNav(reference.normalized) && !/[,;:]/.test(referenceString) &&
            !/[,;:]/.test(cleanReference(referenceString) || '')) {
          chapterNav = chapterNavLinks({
            ...(await this.headingRepository.findChapterNavRows(firstVerseId, lastVerseId)),
            versionSpec: config.versionSpec || null,
          });
        }

        // Section nav replaces chapter nav when the passage is exactly one titled section
        const firstSection = headings.find(h => h.type === 'heading' && h.text && h.verse_id === firstVerseId);
        if (!config._multiBlock && firstSection && firstSection.last_verse_id === lastVerseId && isNewSection) {
          chapterNav = sectionNavLinks({
            prev: await this.neighbourSection(firstVerseId - 1, headingVersion),
            next: await this.neighbourSection(lastVerseId + 1, headingVersion),
            versionSpec: config.versionSpec || null,
          });
        }

        // Attach book slug and version audio to chapter heading for h3 attrs
        const audioFlag = await this.headingRepository.hasAudio(verseIds, version);
        config._audio = audioFlag;
        // Always store bookTitle on config so HtmlPresenter can build slugs even when chapterHeading is null
        config._bookTitle = bookTitle;
        if (chapterHeading) {
          chapterHeading.bookSlug = bookSlug;
          chapterHeading.bookTitle = bookTitle;
          chapterHeading.audio = audioFlag;
          // Fetch chapter for chapterHeading.last and store on the heading object (NOT in vChapterMap,
          // to avoid polluting it with verse_ids outside the passage which causes false cross-chapter
          // detection in isWholeChapter / endChapter logic for inline headings).
          if (chapterHeading.last != null) {
            const chHRows = await this.verseRepository.findChaptersByVerseIds([chapterHeading.last]);
            if (chHRows[0]) chapterHeading._lastChapter = chHRows[0].chapter;
          }
        }
        config._vChapterMap = vChapterMap;

        // Compute canonical ref slug using book_title_short stripped of periods, spaces→dots
        // "Gen." → "gen", "D&C" → "d&c", "1 Cor." → "1.cor", "1 Ne." → "1.ne"
        const bookPart = bookTitleShort.toLowerCase().replace(/\./g, '').replace(/\s+/g, '.');
        const chapterPart = reference.chapter;
        const verseMatch = reference.normalized.match(/:(.+)$/);
        const versePart = verseMatch ? '.' + verseMatch[1] : '';
        config._canonicalRefSlug = `${bookPart}.${chapterPart}${versePart}`;

        // Sub-chapter request: has explicit verse(s) in the reference (e.g. john.3.16, gen.1.1-5)
        const isSubChapterRequest = !!versePart;

        // Cross-chapter range DST slug override (e.g. "Genesis 1:1-2:3" → "genesis.1-2.3")
        const crossChapterNorm = reference.normalized?.match(/:(\d+)-(\d+):(\d+)/);
        const dstSlugOverride = crossChapterNorm ? (() => {
          const sv = parseInt(crossChapterNorm[1]);
          const ec = parseInt(crossChapterNorm[2]);
          const ev = parseInt(crossChapterNorm[3]);
          return sv === 1 ? `${bookPart}.${chapterPart}-${ec}.${ev}` : `${bookPart}.${chapterPart}.${sv}-${ec}.${ev}`;
        })() : null;

        // For sub-chapter requests, look up the chapter's actual first/last verse IDs.
        // These are used for synthetic heading display attrs (heading_verse_id, verse_count, last_verse_id).
        // We cannot use chapterHeading.verse_id because it may come from a different chapter (e.g. KJV).
        let chapterFirstVerseId = chapterHeading?.verse_id ?? firstVerseId;
        let chapterLastVerseId = chapterHeading?.last ?? lastVerseId;
        if (isSubChapterRequest) {
          const bounds = await this.headingRepository.findChapterBounds(bookId, chapterPart);
          if (bounds) {
            chapterFirstVerseId = bounds.first;
            chapterLastVerseId = bounds.last;
          }
        }

        // If no inline section headings exist, generate a synthetic chapter-level h3
        // PHP renders this when a chapter has no section breaks (e.g. LDS version)
        const hasInlineHeadings = headings.some(h => h.type === 'heading');
        const h3sSortedSynth = headings.filter(h => h.type === 'heading').sort((a, b) => a.verse_id - b.verse_id);
        const firstH3VerseId = h3sSortedSynth[0]?.verse_id;
        if (!hasInlineHeadings) {
          if (reference.chapter == null) {
            // Multi-chapter request (e.g. gen.1-2): one synthetic heading per chapter
            for (const { chapter: chNum, rows: chVerses } of chapterRuns(verseRows)) {
              headings.push({
                verse_id: chVerses[0].verse_id,
                type: 'heading',
                text: `${reference.book} ${chNum}`,
                last_verse_id: chVerses[chVerses.length - 1].verse_id,
                version,
                book_id: bookId,
                synthetic: true,
                _wholeChapter: true,
                _chapterNum: chNum
              });
            }
          } else if (verseRows.slice(1).some(r => (r.text || '').startsWith('§'))) {
            // A verse range that crosses into a new section (e.g. Gen 1:30-2:3 in LDS):
            // PHP starts a new headless heading at every verse that begins with §.
            const groups = [];
            verseRows.forEach((r, i) => {
              if (i === 0 || (r.text || '').startsWith('§')) groups.push([]);
              groups[groups.length - 1].push(r);
            });
            for (const g of groups) {
              const chNum = g[0].chapter;
              const bounds = await this.headingRepository.findChapterBounds(bookId, chNum);
              headings.push({
                verse_id: g[0].verse_id,
                type: 'heading',
                text: `${reference.book} ${chNum}`,
                last_verse_id: g[g.length - 1].verse_id,
                version,
                book_id: bookId,
                synthetic: true,
                _chapterNum: chNum,
                _chapterVerseId: bounds?.first ?? g[0].verse_id,
                _chapterLast: bounds?.last ?? g[g.length - 1].verse_id
              });
            }
          } else {
            headings.push({
              verse_id: firstVerseId,
              type: 'heading',
              text: `${reference.book} ${reference.chapter}`,
              last_verse_id: lastVerseId,
              version,
              book_id: bookId,
              synthetic: true,  // flag: renders with headless="1"
              // Chapter-level display attrs for sub-chapter requests
              _chapterVerseId: chapterFirstVerseId,
              _chapterLast: chapterLastVerseId
            });
          }
        } else if (firstH3VerseId && firstH3VerseId > firstVerseId && !(chapterHeading && chapterHeading.heading)) {
          // Pre-section synthetic: inline headings exist but first one is AFTER firstVerseId,
          // AND there is no meaningful chapter-level section heading (title-only records don't count).
          // PHP renders a headless h3 at firstVerseId spanning the whole chapter,
          // with ref/slug scoped to just verse 1 (using _sectionLast = firstH3VerseId - 1).
          headings.push({
            verse_id: firstVerseId,
            type: 'heading',
            text: '',
            last_verse_id: lastVerseId,
            version,
            book_id: bookId,
            preSectionSynthetic: true,
            _sectionLast: firstH3VerseId - 1
          });
        }

        // Compute parallel attrs for h3 headings — needs heading ranges
        const h3s = headings
          .filter(h => h.type === 'heading')
          .sort((a, b) => a.verse_id - b.verse_id);

        if (h3s.length) {
          // Build verse number map from verse rows
          const vNumMap = {};
          for (const v of verseRows) vNumMap[v.verse_id] = v.verse;
          const passLastNum = verseRows[verseRows.length - 1]?.verse ?? 0;

          // Track mid-section verse_ids: verses where §¶ appears MID-TEXT (not at start).
          // First segment must have no § in meta (it's previous-section content), and a later
          // segment starts the new section. Excludes verses where the whole verse starts a new section.
          const midSectionIds = new Set(
            verseRows.filter(v => {
              const segs = VerseSerializer.splitSegments(v.text);
              return segs.length > 1 && !segs[0].meta.includes('§');
            }).map(v => v.verse_id)
          );

          // Build set of actual verse_ids present in scripture_verses for this version
          const verseIdSet = new Set(verseRows.map(v => v.verse_id));

          const ranges = h3s.map((h) => {
            // preSectionSynthetic: use _sectionLast (verses before first real heading) for parallel range,
            // not last_verse_id (which spans the whole chapter for display purposes).
            const effectiveLast = (h.preSectionSynthetic && h._sectionLast) ? h._sectionLast : (h.last_verse_id || lastVerseId);
            const last = effectiveLast;
            // Cap range at passage end to avoid cross-chapter parallels
            const rangeEnd = Math.min(last, lastVerseId);
            const fv = vNumMap[h.verse_id] ?? 1;
            // extendedEnd is for lastVerseNum display only (h3 ref/slug attr).
            // The parallel query uses rangeEnd (non-extended) to match PHP's $verselist behavior.
            const extendedEnd = midSectionIds.has(rangeEnd + 1) && rangeEnd + 1 <= lastVerseId ? rangeEnd + 1 : rangeEnd;
            // Fallback to -1 in case a verse_id is missing from scripture_verses for this version
            const lv = vNumMap[extendedEnd] ?? vNumMap[extendedEnd - 1] ?? passLastNum;
            // Per-heading chapter: use _chapterNum (multi-chapter synthetics), vChapterMap (inline), or chapterPart
            const hChapter = h._chapterNum ?? vChapterMap[h.verse_id] ?? chapterPart;
            // A "whole chapter" heading starts at verse 1 and covers to the end of its chapter.
            // PHP renders these with chapter-level slug/ref (no verse range), same as synthetic headings.
            // Sub-chapter requests (explicit verses in URL) are never whole-chapter.
            // Preserve h._wholeChapter if already set (e.g. per-chapter synthetics in multi-chapter requests).
            // For multi-chapter requests: also treat as whole-chapter when the heading covers exactly one
            // full chapter (rangeEnd+1 is in a different chapter or not in the passage).
            const nextChapter = vChapterMap[rangeEnd + 1] ?? hChapter;
            const rangeEndChapter = vChapterMap[rangeEnd] ?? hChapter;
            // Whole-chapter: starts at verse 1 AND ends at the last verse of its own chapter
            // (rangeEnd is in the same chapter as heading, and the next verse is a different chapter).
            // Cross-chapter sections (e.g. Gen 1:1–2:3) are excluded because rangeEnd is in a different chapter.
            const isWholeChapter = h._wholeChapter || (!isSubChapterRequest && fv === 1 &&
              (rangeEnd >= lastVerseId || (nextChapter !== hChapter && rangeEndChapter === hChapter)));
            if (isWholeChapter) h._wholeChapter = true;
            // rangeLastVerse: verse number at rangeEnd (non-extended) — used for parallel DST slug
            // lastVerse: verse number at extendedEnd — used for H3 ref/slug display in HtmlPresenter
            const rangeLastVerse = vNumMap[rangeEnd] ?? vNumMap[rangeEnd - 1] ?? passLastNum;
            // Zero-length sections (rangeEnd === h.verse_id): extend query range and DST to extendedEnd
            // so that the parallel query includes the next verse (which the section "owns" its first segment).
            const isZeroLength = rangeEnd === h.verse_id;
            const queryTo = isZeroLength ? extendedEnd : rangeEnd;
            // PHP computes parallels using actual rendered verse_ids (only those in scripture_verses),
            // not a numeric range. Extend to extendedEnd to include mid-section verse at section boundary.
            const actualIds = verseRows
              .filter(v => v.verse_id >= h.verse_id && v.verse_id <= extendedEnd)
              .map(v => v.verse_id);
            // verseNums: verse numbers for actualIds, used for DST slug (handles missing verses/gaps)
            const verseNums = actualIds.map(id => vNumMap[id]).filter(v => v != null);
            // endChapter: chapter of the last verse in the range (for cross-chapter DST slug detection)
            const endChapter = vChapterMap[extendedEnd] ?? hChapter;
            // Verses that skip chapters ("John 3:16; 4:2"): one part per run
            const runs = endChapter !== hChapter
              ? splitRuns(actualIds.map(id => ({ id, chapter: vChapterMap[id], verse: vNumMap[id] })))
              : null;
            return { from: h.verse_id, to: queryTo, ids: actualIds, verseNums, bookSlug: bookPart, chapter: hChapter, endChapter, firstVerse: fv, lastVerse: lv, rangeLastVerse, zeroLength: isZeroLength, synthetic: !!h.synthetic, wholeChapter: isWholeChapter, dstSlugOverride: runs ? `${bookPart}.${runs.slug}` : (endChapter !== hChapter ? dstSlugOverride : null) };
          });

          const parallelMap = await this.headingRepository.findParallels(ranges, version);

          // Attach parallel string to each heading record
          for (const h of h3s) {
            if (parallelMap[h.verse_id]) {
              h.parallel = parallelMap[h.verse_id];
            }
          }

          // Compute parallel for pre-passage section (when chapterHeading.verse_id < firstVerseId
          // AND the section overlaps the passage: chLast >= firstVerseId).
          // Cases:
          //   chLast < firstVerseId: section ends before passage (e.g. NRSV Ps.22) → full-chapter parallel (fallback below)
          //   chLast < lastVerseId: partial overlap (e.g. NRSV Gen.2, Isa.10) → verse-range parallel
          //   chLast >= lastVerseId: section covers full passage (e.g. NRSV Isa.3) → whole-chapter parallel
          if (chapterHeading && chapterHeading.verse_id < firstVerseId) {
            const chLast = chapterHeading.last ?? lastVerseId;
            if (chLast >= firstVerseId) {
              const ppFv = vNumMap[firstVerseId] ?? 1;
              const isFullPassage = chLast >= lastVerseId;
              // For full-passage coverage: use the whole passage verse list (wholeChapter=true → chapter-level slug)
              // For partial overlap: use actual verse_ids from firstVerseId to chLast (inclusive).
              // Extend to chLast+1 if it's a mid-section verse (§¶ mid-text) — the section owns its first segment.
              const ppOverlapEnd = (!isFullPassage && midSectionIds.has(chLast + 1)) ? chLast + 1 : chLast;
              const ppIds = isFullPassage
                ? verseRows.map(v => v.verse_id)
                : verseRows.filter(v => v.verse_id >= firstVerseId && v.verse_id <= ppOverlapEnd).map(v => v.verse_id);
              const ppVerseNums = ppIds.map(id => vNumMap[id]).filter(v => v != null);
              const ppRangeEnd = isFullPassage ? lastVerseId : (ppIds[ppIds.length - 1] ?? chLast);
              const ppLv = vNumMap[ppRangeEnd] ?? passLastNum;
              const ppRangeLastVerse = ppLv;
              // Sub-chapter requests: never use chapter-level DST slug even if section covers full passage
              // For multi-chapter requests, use per-verse chapter mapping for correct DST slug
              const ppStartChapter = vChapterMap[firstVerseId] ?? chapterPart;
              const ppEndChapter = vChapterMap[ppRangeEnd] ?? vChapterMap[lastVerseId] ?? ppStartChapter;
              const ppRange = [{ from: firstVerseId, to: ppRangeEnd, ids: ppIds, verseNums: ppVerseNums, bookSlug: bookPart, chapter: ppStartChapter, endChapter: ppEndChapter, firstVerse: ppFv, lastVerse: ppLv, rangeLastVerse: ppRangeLastVerse, synthetic: false, wholeChapter: isFullPassage && !isSubChapterRequest }];
              const ppParallelMap = await this.headingRepository.findParallels(ppRange, version);
              if (ppParallelMap[firstVerseId]) {
                chapterHeading._prePassageParallel = ppParallelMap[firstVerseId];
              }
            }
            // Fallback: section ends before passage (chLast < firstVerseId).
            // Two sub-cases:
            //   A) Same-chapter prePassageH3 (e.g. Mk 16:1-8 before Mk 16:9-20): compute single-verse parallel
            //      for just the first verse, because prePassageH3 ref uses first-verse-only slug.
            //   B) Cross-chapter prePassageH3 (e.g. Ps.21 heading before Ps.22 passage): copy parallel from
            //      the inline h3 at firstVerseId (which uses the full passage range as its DST slug).
            if (!chapterHeading._prePassageParallel && chapterHeading.heading && chLast < firstVerseId) {
              const chLastChap = chapterHeading._lastChapter ?? null;
              const firstVChap = vChapterMap[firstVerseId];
              const isCrossChap = chLastChap != null && firstVChap != null && chLastChap !== firstVChap;
              if (!isCrossChap) {
                // Same-chapter: compute parallel for just the first verse
                const ppFv = vNumMap[firstVerseId] ?? 1;
                const ppStartChapter = vChapterMap[firstVerseId] ?? chapterPart;
                const ppSingleRange = [{ from: firstVerseId, to: firstVerseId, ids: [firstVerseId], verseNums: [ppFv], bookSlug: bookPart, chapter: ppStartChapter, endChapter: ppStartChapter, firstVerse: ppFv, lastVerse: ppFv, rangeLastVerse: ppFv, synthetic: false, wholeChapter: false }];
                const ppSingleMap = await this.headingRepository.findParallels(ppSingleRange, version);
                if (ppSingleMap[firstVerseId]) {
                  chapterHeading._prePassageParallel = ppSingleMap[firstVerseId];
                }
              }
            }
            if (!chapterHeading._prePassageParallel && chapterHeading.heading) {
              const firstH3 = h3s.find(h => h.verse_id === firstVerseId);
              if (firstH3 && firstH3.parallel) {
                chapterHeading._prePassageParallel = firstH3.parallel;
              }
            }
          }
        }
      }
    }

    config._faxIds = verseIds.length ? await this.headingRepository.findFaxVerseIds(verseIds, version) : [];

    return new ScriptureResult({
      reference,
      verses,
      headings,
      chapterHeading,
      chapterNav,
      annotations: [],
      config: { ...config, version, headingVersion }
    });
  }

  // The heading section containing verseId, as { ref, heading } (scriptutil::loadHeading)
  async neighbourSection(verseId, version) {
    const book = await this.headingRepository.findBookId(verseId);
    if (!book) return null;
    const h = await this.headingRepository.findChapterHeading(verseId, book.book_id, version, true);
    if (!h || (h.verse_id !== verseId && !h.heading)) return null;
    const last = h.last ?? (await this.headingRepository.findBookBounds(book.book_id))?.last;
    if (!last) return null;
    const [first, end] = await Promise.all([
      this.verseRepository.findIndexRows([h.verse_id]),
      this.verseRepository.findIndexRows([last]),
    ]);
    if (!first[0] || !end[0]) return null;
    const bounds = await this.headingRepository.findChapterBounds(end[0].book_id, end[0].chapter);
    const chapterMax = bounds ? bounds.last - bounds.first + 1 : end[0].verse;
    return { ref: sectionRef(first[0].book_title_short, first[0], end[0], chapterMax), heading: h.heading || '' };
  }

  async getAvailableVersions(referenceString) {
    const reference = this.referenceService.parse(referenceString);
    if (reference.isEmpty) return [];
    return this.verseRepository.findVersionsForVerseIds(reference.verseIds);
  }
}

export default new ScriptureLookupService(
  referenceService,
  verseRepository,
  headingRepository
);
