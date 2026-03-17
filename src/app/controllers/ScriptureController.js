import scriptureLookupService from '../../services/ScriptureLookupService.js';
import { OutputFormat } from '../../domain/enums/OutputFormat.js';

export class ScriptureController {
  constructor(lookupService) {
    this.lookupService = lookupService;
  }

  async show(req, res, next) {
    try {
      const { reference } = req.params;
      const config = req.config || {};

      // Use default version from subdomain if not in config
      if (req.defaultVersion && !req.query.version) {
        config.version = req.defaultVersion;
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
    res.render('home', {
      config: req.config || {}
    });
  }
}

export default new ScriptureController(scriptureLookupService);
