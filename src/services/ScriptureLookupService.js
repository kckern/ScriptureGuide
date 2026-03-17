import referenceService from './ReferenceService.js';
import verseRepository from '../data/repositories/VerseRepository.js';
import headingRepository from '../data/repositories/HeadingRepository.js';
import { Verse } from '../domain/entities/Verse.js';
import { ScriptureResult } from '../domain/entities/ScriptureResult.js';

export class ScriptureLookupService {
  constructor(refService, verseRepo, headingRepo) {
    this.referenceService = refService;
    this.verseRepository = verseRepo;
    this.headingRepository = headingRepo;
  }

  async lookup(referenceString, config = {}) {
    const reference = this.referenceService.parse(referenceString);

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
        const audioFlag = await this.headingRepository.findVersionAudio(version);
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
            // If next verse after rangeEnd is a mid-section verse, include it in the range
            const extendedEnd = midSectionIds.has(rangeEnd + 1) && rangeEnd + 1 <= lastVerseId ? rangeEnd + 1 : rangeEnd;
            const lv = vNumMap[extendedEnd] ?? passLastNum;
            return { from: h.verse_id, to: extendedEnd, bookSlug: bookPart, chapter: chapterPart, firstVerse: fv, lastVerse: lv, synthetic: !!h.synthetic };
          });

          const parallelMap = await this.headingRepository.findParallels(ranges, version);

          // Attach parallel string to each heading record
          for (const h of h3s) {
            if (parallelMap[h.verse_id]) {
              h.parallel = parallelMap[h.verse_id];
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
