import referenceService from './ReferenceService.js';
import verseRepository from '../data/repositories/VerseRepository.js';
import headingRepository from '../data/repositories/HeadingRepository.js';
import { Verse } from '../domain/entities/Verse.js';
import { ScriptureResult } from '../domain/entities/ScriptureResult.js';
import { Reference } from '../domain/entities/Reference.js';

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

  async lookup(referenceString, config = {}) {
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

    if (reference.isEmpty) {
      return new ScriptureResult({ reference, verses: [], headings: [], config });
    }

    const version = config.version || 'KJV';
    const verseIds = reference.verseIds;

    // Fetch verses
    const verseRows = await this.verseRepository.findByIds(verseIds, version);
    const verses = verseRows.map(row => Verse.fromRow(row));

    // Fetch inline headings (version-filtered)
    let headings = [];
    let chapterHeading = null;
    let chapterNav = null;

    if (config.includeHeadings !== false && verseIds.length > 0) {
      headings = await this.headingRepository.findByVerseIds(verseIds, version);

      const firstVerseId = verseIds[0];
      const lastVerseId = verseIds[verseIds.length - 1];
      const bookInfo = await this.headingRepository.findBookId(firstVerseId);

      if (bookInfo) {
        const { book_id: bookId, lds_org: bookSlug, book_title_short: bookTitleShort, book_title: bookTitle } = bookInfo;
        // PHP loadHeading: if first verse starts with §¶, do NOT decrement verse_id for lookup
        const firstVerseText = verseRows[0]?.text || '';
        const isNewSection = firstVerseText.startsWith('§¶');
        chapterHeading = await this.headingRepository.findChapterHeading(firstVerseId, bookId, version, isNewSection);
        chapterNav = await this.headingRepository.findChapterNav(firstVerseId, lastVerseId);

        // Attach book slug and version audio to chapter heading for h3 attrs
        const audioFlag = await this.headingRepository.hasAudio(verseIds, version);
        // Always store bookTitle on config so HtmlPresenter can build slugs even when chapterHeading is null
        config._bookTitle = bookTitle;
        if (chapterHeading) {
          chapterHeading.bookSlug = bookSlug;
          chapterHeading.bookTitle = bookTitle;
          chapterHeading.audio = audioFlag;
        }

        // Compute canonical ref slug using book_title_short stripped of periods/spaces
        // "Gen." → "gen", "D&C" → "d&c", "1 Ne." → "1ne"
        const bookPart = bookTitleShort.toLowerCase().replace(/\./g, '').replace(/\s+/g, '');
        const chapterPart = reference.chapter;
        const verseMatch = reference.normalized.match(/:(.+)$/);
        const versePart = verseMatch ? '.' + verseMatch[1] : '';
        config._canonicalRefSlug = `${bookPart}.${chapterPart}${versePart}`;

        // If no inline section headings exist, generate a synthetic chapter-level h3
        // PHP renders this when a chapter has no section breaks (e.g. LDS version)
        const hasInlineHeadings = headings.some(h => h.type === 'heading');
        const h3sSortedSynth = headings.filter(h => h.type === 'heading').sort((a, b) => a.verse_id - b.verse_id);
        const firstH3VerseId = h3sSortedSynth[0]?.verse_id;
        if (!hasInlineHeadings) {
          headings.push({
            verse_id: firstVerseId,
            type: 'heading',
            text: `${reference.book} ${reference.chapter}`,
            last_verse_id: lastVerseId,
            version,
            book_id: bookId,
            synthetic: true  // flag: renders with headless="1"
          });
        } else if (firstH3VerseId && firstH3VerseId > firstVerseId) {
          // Pre-section synthetic: inline headings exist but first one is AFTER firstVerseId.
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

          // Track mid-section verse_ids (§¶ in text) — same logic as HtmlPresenter
          const midSectionIds = new Set(
            verseRows.filter(v => v.text && v.text.includes('§')).map(v => v.verse_id)
          );

          const ranges = h3s.map((h) => {
            const last = h.last_verse_id || lastVerseId;
            // Cap range at passage end to avoid cross-chapter parallels
            const rangeEnd = Math.min(last, lastVerseId);
            const fv = vNumMap[h.verse_id] ?? 1;
            // extendedEnd is for lastVerseNum display only (h3 ref/slug attr).
            // The parallel query uses rangeEnd (non-extended) to match PHP's $verselist behavior.
            const extendedEnd = midSectionIds.has(rangeEnd + 1) && rangeEnd + 1 <= lastVerseId ? rangeEnd + 1 : rangeEnd;
            const lv = vNumMap[extendedEnd] ?? passLastNum;
            // A "whole chapter" heading starts at verse 1 and covers to the end of the passage.
            // PHP renders these with chapter-level slug/ref (no verse range), same as synthetic headings.
            const isWholeChapter = fv === 1 && rangeEnd >= lastVerseId;
            if (isWholeChapter) h._wholeChapter = true;
            // rangeLastVerse: verse number at rangeEnd (non-extended) — used for parallel DST slug
            // lastVerse: verse number at extendedEnd — used for H3 ref/slug display in HtmlPresenter
            const rangeLastVerse = vNumMap[rangeEnd] ?? passLastNum;
            // Zero-length sections (rangeEnd === h.verse_id): extend query range and DST to extendedEnd
            // so that the parallel query includes the next verse (which the section "owns" its first segment).
            const isZeroLength = rangeEnd === h.verse_id;
            const queryTo = isZeroLength ? extendedEnd : rangeEnd;
            return { from: h.verse_id, to: queryTo, bookSlug: bookPart, chapter: chapterPart, firstVerse: fv, lastVerse: lv, rangeLastVerse, zeroLength: isZeroLength, synthetic: !!h.synthetic, wholeChapter: !!h.synthetic || isWholeChapter };
          });

          const parallelMap = await this.headingRepository.findParallels(ranges, version);

          // Attach parallel string to each heading record
          for (const h of h3s) {
            if (parallelMap[h.verse_id]) {
              h.parallel = parallelMap[h.verse_id];
            }
          }

          // Compute parallel for pre-passage section (when chapterHeading.verse_id < firstVerseId
          // AND the section extends into the passage: chLast >= firstVerseId && chLast < lastVerseId).
          // e.g. NRSV Gen.2: Gen.1 heading covers Gen 2:1-3; Gen 2:4+ is a separate section.
          if (chapterHeading && chapterHeading.verse_id < firstVerseId) {
            const chLast = chapterHeading.last ?? lastVerseId;
            if (chLast >= firstVerseId && chLast < lastVerseId) {
              const ppFv = vNumMap[firstVerseId] ?? 1;
              // Use chLast+1 as exclusive boundary (PHP includes the boundary verse in verselist)
              const ppRangeEnd = chLast + 1;
              const ppRangeLastVerse = vNumMap[ppRangeEnd] ?? vNumMap[chLast] ?? passLastNum;
              const ppLv = ppRangeLastVerse;
              const ppRange = [{ from: firstVerseId, to: ppRangeEnd, bookSlug: bookPart, chapter: chapterPart, firstVerse: ppFv, lastVerse: ppLv, rangeLastVerse: ppRangeLastVerse, synthetic: false, wholeChapter: false }];
              const ppParallelMap = await this.headingRepository.findParallels(ppRange, version);
              if (ppParallelMap[firstVerseId]) {
                chapterHeading._prePassageParallel = ppParallelMap[firstVerseId];
              }
            }
          }
        }
      }
    }

    return new ScriptureResult({
      reference,
      verses,
      headings,
      chapterHeading,
      chapterNav,
      annotations: [],
      config: { ...config, version }
    });
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
