import scriptureLookupService from '../../services/ScriptureLookupService.js';
import searchParallelController from './SearchParallelController.js';
import outputMiddleware from '../middleware/output.js';
import referenceService from '../../services/ReferenceService.js';
import legacyBlockService, { allVerseIds } from '../../services/LegacyBlockService.js';
import { ScriptureResult } from '../../domain/entities/ScriptureResult.js';
import { Reference } from '../../domain/entities/Reference.js';
import { blockVerseIds } from '../../domain/rules/blockIds.js';
import { RequestBudget } from '../../domain/rules/requestBudget.js';
import { bookOnlyQuery } from '../../domain/rules/referenceParsing.js';
import { isEmptyReference } from '../../domain/rules/requestParsing.js';

// Formats whose reference blocks ("meta") name a book given alone (scriptures::loadMetaFromRef)
const BOOK_ONLY_FORMATS = new Set(['meta', 'api']);
// Formats that answer an empty reference in their own format: index.php dispatched these
// subdomains before its empty($ref) → home.php check.
const EMPTY_REF_FORMATS = new Set(['api', 'meta', 'raw', 'plain', 'latex', 'markdown', 'xml']);
const answersEmpty = config => EMPTY_REF_FORMATS.has(config?.outputFormat);
const isHtml = config => !config?.outputFormat || config.outputFormat === 'html';

// A section that found no verses, headed by its PHP block (HtmlPresenter reads legacyBlock).
function blockSection(block, config) {
  const section = new ScriptureResult({ reference: new Reference({ query: block.orig, normalized: '', verseIds: [] }), verses: [], config });
  section.legacyBlock = block;
  return section;
}

export class ScriptureController {
  constructor(lookupService, references = referenceService, blockService = legacyBlockService) {
    this.lookupService = lookupService;
    this.references = references;
    this.blockService = blockService;
  }

  // A reference that found no verses: the blocks the PHP site built for it (cleanReference, one
  // per ";" piece, multi-book ranges), from the reference PHP saw on the legacy formats and the
  // one looked up on html. The meta/api/plain/raw blocks and the html headings come from these.
  async legacyBlocks(result, config) {
    if (result.reference?.verseIds?.length || config.parallel) return undefined;
    const ref = isHtml(config) ? config.reference : config.legacy?.ref;
    return this.blockService.blocks(isEmptyReference(ref) ? '' : ref ?? '', config._budget);
  }

  // A word alone that matched no verses: when it is a whole book name (or alias), its first
  // chapter, as { book, verseIds }; otherwise null. Only the meta blocks use it.
  async bookOnly(result, config) {
    if (!BOOK_ONLY_FORMATS.has(config.outputFormat) || !result.reference.isEmpty) return undefined;
    const name = bookOnlyQuery(config.legacy?.ref);
    return name ? this.references.resolveBookOnly(name) : undefined;
  }

  async show(req, res, next) {
    try {
      // Parallel (a~b) and search pages
      if (await searchParallelController.dispatch(req, res)) return;

      const config = req.config || {};
      // What this request may resolve (pieces, verses, queries), shared by the lookup and the
      // PHP blocks
      config._budget ??= new RequestBudget();
      // req.config.reference is parsed from the whole path (version spec, shortcuts, =/, random).
      // A parallel q reached through ?q= has no route param: use the parsed q.
      const reference = config.parallel ? (req.params?.reference || config.reference) : (config.reference ?? req.params.reference);

      if (isEmptyReference(reference) && !config.parallel && !answersEmpty(config)) return this.home(req, res);

      const result = await this.lookupService.lookup(isEmptyReference(reference) ? '' : reference, config);
      result.bookOnly = await this.bookOnly(result, config);
      result.legacyBlocks = await this.legacyBlocks(result, config);

      if (isHtml(config) && result.legacyBlocks) {
        const page = await this.notFoundPage(result.legacyBlocks, config);
        // index.php: every id null → referenceFromVerseIds gave "" → empty($ref) → home.php
        if (!page) return res.render('home', { config, title: '' });
        req.scriptureResult = page;
        return next();
      }

      // Attach result for output middleware
      req.scriptureResult = result;
      next();
    } catch (err) {
      next(err);
    }
  }

  // The html page index.php rendered for the PHP blocks of a reference the lookup found nothing
  // for: one section per block (its verses, a "not found" heading, or an empty range), titled
  // with the reference of every verse id (referenceFromVerseIds), else with the reference as
  // given. null when every id was null: live rendered the home page with an empty title.
  async notFoundPage(blocks, config) {
    const all = allVerseIds(blocks);
    const found = blocks.flatMap(blockVerseIds);
    if (!found.length && all?.length) return null;
    const sections = [];
    const options = { ...config, _block: true, _multiBlock: blocks.length > 1 };
    for (const block of blocks) {
      const ids = blockVerseIds(block);
      sections.push(ids.length ? await this.lookupIds(ids, options) : blockSection(block, config));
    }
    const title = found.length && all ? await this.blockService.repo.referenceFromVerseIds(found) : config.reference;
    const withVerses = sections.filter(s => s.verses?.length);
    const page = new ScriptureResult({
      reference: new Reference({ query: config.reference, normalized: '', verseIds: found }),
      verses: withVerses.flatMap(s => s.verses),
      headings: withVerses.flatMap(s => s.headings),
      chapterHeading: withVerses[0]?.chapterHeading ?? null,
      config: withVerses[0]?.config ?? config,
      sections,
    });
    page.title = title || config.reference;
    return page;
  }

  // The verses of a block PHP found by verse title: looked up by their reference
  // (referenceFromVerseIds, "The Book of Lehi 1") when that finds the same verses, so headings
  // read as for a typed reference; else by the ids themselves.
  async lookupIds(ids, options) {
    const ref = await this.blockService.repo.referenceFromVerseIds(ids);
    if (ref) {
      const result = await this.lookupService.lookup(ref, options);
      const got = result.reference?.verseIds || [];
      if (got.length === ids.length && got.every((id, i) => Number(id) === Number(ids[i]))) return result;
    }
    return this.lookupService.lookup(ids.join(','), options);
  }

  async home(req, res) {
    // "/?q=john.3.16" (index.php?q=...) is a lookup, not the home page; nor is "/" on api, meta, ...
    if ((req.config?.reference && !req.params?.reference) || answersEmpty(req.config)) {
      return this.show(req, res, err => (err ? res.status(500).send('Internal error') : outputMiddleware(req, res)));
    }
    res.render('home', {
      config: req.config || {}
    });
  }
}

export default new ScriptureController(scriptureLookupService);
