import scriptureLookupService from '../../services/ScriptureLookupService.js';
import searchParallelController from './SearchParallelController.js';
import outputMiddleware from '../middleware/output.js';
import referenceService from '../../services/ReferenceService.js';
import { bookOnlyQuery } from '../../domain/rules/referenceParsing.js';
import { isEmptyReference } from '../../domain/rules/requestParsing.js';

// Formats whose reference blocks ("meta") name a book given alone (scriptures::loadMetaFromRef)
const BOOK_ONLY_FORMATS = new Set(['meta', 'api']);
// Formats that answer an empty reference in their own format: index.php dispatched these
// subdomains before its empty($ref) → home.php check.
const EMPTY_REF_FORMATS = new Set(['api', 'meta', 'raw', 'plain', 'latex', 'markdown', 'xml']);
const answersEmpty = config => EMPTY_REF_FORMATS.has(config?.outputFormat);

export class ScriptureController {
  constructor(lookupService, references = referenceService) {
    this.lookupService = lookupService;
    this.references = references;
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
      // req.config.reference is parsed from the whole path (version spec, shortcuts, =/, random).
      // A parallel q reached through ?q= has no route param: use the parsed q.
      const reference = config.parallel ? (req.params?.reference || config.reference) : (config.reference ?? req.params.reference);

      if (isEmptyReference(reference) && !config.parallel && !answersEmpty(config)) return this.home(req, res);

      const result = await this.lookupService.lookup(isEmptyReference(reference) ? '' : reference, config);
      result.bookOnly = await this.bookOnly(result, config);

      // Attach result for output middleware
      req.scriptureResult = result;
      next();
    } catch (err) {
      next(err);
    }
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
