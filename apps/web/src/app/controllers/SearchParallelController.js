import parallelService from '../../services/ParallelService.js';
import searchService from '../../services/SearchService.js';
import { slugifyRef } from '../../services/legacyReference.js';
import { OutputFormat } from '../../domain/enums/OutputFormat.js';

// Routes the PHP front controller (lib.php.inc) sends to parallel.php and search.php:
//   - any path with "~" after its first character: parallel view
//   - /search/<query>: search
//   - a reference with no digits: search, limited to the path's version if there is one
export class SearchParallelController {
  constructor(parallel = parallelService, search = searchService) {
    this.parallel = parallel;
    this.searchService = search;
  }

  // Returns true when it handled the request.
  async dispatch(req, res) {
    if ((req.config?.outputFormat || OutputFormat.HTML) !== OutputFormat.HTML) return false;
    const reference = req.params.reference || '';
    const version = req.params.version || '';
    const q = version ? `${version}/${reference}` : reference;
    const ogUrl = `http://${req.headers.host || ''}${req.originalUrl || ''}`;

    if (q.indexOf('~') > 0) {
      const page = await this.parallel.build(q);
      if (!page) return false;
      res.render('parallel', { ...page, config: req.config || {}, ogUrl });
      return true;
    }

    let query = null, forcedVersion = null;
    if (version === 'search' && reference) query = reference;
    else if (reference && !/[0-9]/.test(reference)) { query = reference; forcedVersion = version ? version.toUpperCase() : null; }
    if (query === null) return false;

    const result = await this.searchService.search(query, { forcedVersion });
    res.render('search', { ...result, config: req.config || {}, slugref: slugifyRef(result.query), ogUrl });
    return true;
  }
}

export default new SearchParallelController();
