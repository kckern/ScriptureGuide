import scriptureLookupService from '../../services/ScriptureLookupService.js';
import searchRepository from '../../data/repositories/SearchRepository.js';
import outputMiddleware from '../middleware/output.js';

export class ScriptureController {
  constructor(lookupService) {
    this.lookupService = lookupService;
  }

  async show(req, res, next) {
    try {
      const config = req.config || {};
      // req.config.reference is parsed from the whole path (version spec, shortcuts, =/, random);
      // parallel requests keep the raw route parameter until the parallel view handles them.
      const reference = config.parallel ? req.params.reference : (config.reference ?? req.params.reference);

      if (!reference && !config.parallel) return this.home(req, res);

      if (config.search && !config.parallel) {
        const query = reference.replace(/\./g, ' ').trim();
        const version = config.version || 'LDS';
        const { results, totals, total, terms } = await searchRepository.search(query, version);
        return res.render('search', { query, results, totals, total, terms, config });
      }

      const result = await this.lookupService.lookup(reference, config);

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
