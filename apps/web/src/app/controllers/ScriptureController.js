import scriptureLookupService from '../../services/ScriptureLookupService.js';
import searchParallelController from './SearchParallelController.js';
import outputMiddleware from '../middleware/output.js';
import referenceService from '../../services/ReferenceService.js';
import { bookOnlyQuery } from '../../domain/rules/referenceParsing.js';

// Formats whose reference blocks ("meta") name a book given alone (scriptures::loadMetaFromRef)
const BOOK_ONLY_FORMATS = new Set(['meta', 'api']);

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
      const reference = config.parallel ? req.params.reference : (config.reference ?? req.params.reference);

      if (!reference && !config.parallel) return this.home(req, res);

      const result = await this.lookupService.lookup(reference, config);
      result.bookOnly = await this.bookOnly(result, config);

      // Attach result for output middleware
      req.scriptureResult = result;
      next();
    } catch (err) {
      next(err);
    }
  }

  async home(req, res) {
    // "/?q=john.3.16" (index.php?q=...) is a lookup, not the home page
    if (req.config?.reference && !req.params?.reference) {
      return this.show(req, res, err => (err ? res.status(500).send('Internal error') : outputMiddleware(req, res)));
    }
    res.render('home', {
      config: req.config || {}
    });
  }
}

export default new ScriptureController(scriptureLookupService);
