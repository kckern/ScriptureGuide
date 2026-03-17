import { OutputFormat } from '../../domain/enums/OutputFormat.js';

export function configMiddleware(req, res, next) {
  // Build config from request parameters — version can come from path prefix (/LDS/...), query, or default
  req.config = {
    version: req.versionFromPath || req.query.version || req.query.v || 'LDS',
    outputFormat: req.outputFormat || OutputFormat.HTML,
    includeHeadings: req.query.headings !== '0',
    includeAnnotations: req.query.annotations === '1',
    includeVerseNumbers: req.query.versenums !== '0',
    includeMeta: req.query.meta === '1'
  };

  next();
}

export default configMiddleware;
