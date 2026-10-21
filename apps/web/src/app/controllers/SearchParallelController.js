import parallelService from '../../services/ParallelService.js';
import searchService from '../../services/SearchService.js';
import { slugifyRef } from '../../domain/rules/legacyReference.js';
import { OutputFormat } from '../../domain/enums/OutputFormat.js';
import { searchVersion, isEmptyReference } from '../../domain/rules/requestParsing.js';

// The html body of the PHP front controller (index.php), in its order, from the parsed request
// (req.config), never from the Express route params:
//   - any q with "~" after its first character: parallel view
//   - an empty reference: the home page (checked before search, as PHP's empty($ref)), titled
//     "Home", or "0" for the reference "0"
//   - /search/<query> or a reference with no digits: search, limited to the format of the last
//     version piece; the terms are PHP's $ref ("&" fragments removed), dots read as spaces
export class SearchParallelController {
  constructor(parallel = parallelService, search = searchService) {
    this.parallel = parallel;
    this.searchService = search;
  }

  // Returns true when it handled the request.
  async dispatch(req, res) {
    const config = req.config || {};
    if ((config.outputFormat || OutputFormat.HTML) !== OutputFormat.HTML) return false;
    const ogUrl = `http://${req.headers.host || ''}${req.originalUrl || ''}`;

    if (config.parallel) {
      const page = await this.parallel.build(config.reference);
      if (!page) return false;
      res.render('parallel', { ...page, config, ogUrl });
      return true;
    }

    if (isEmptyReference(config.reference)) {
      // "0" has a digit, so live looked it up and titled the page with it; "" searched ("Home")
      res.render('home', { config, title: config.reference === '0' ? '0' : 'Home' });
      return true;
    }

    if (!config.search) return false;
    const query = String(config.legacy?.ref ?? config.reference).replace(/\./g, ' ');
    const result = await this.searchService.search(query, { forcedVersion: searchVersion(config.versionSpec) });
    res.render('search', { ...result, config, slugref: slugifyRef(result.query), ogUrl });
    return true;
  }
}

export default new SearchParallelController();
