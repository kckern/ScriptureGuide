import { OutputFormat } from '../../domain/enums/OutputFormat.js';
import HtmlPresenter from '../../presentation/presenters/HtmlPresenter.js';
import { logError } from '../log.js';

// Format registry: a format is implemented by src/presentation/presenters/formats/<format>.js,
// whose default export has present(result, req, res). Formats without a module render HTML.
const html = new HtmlPresenter();
const loaded = new Map();

async function presenterFor(format) {
  if (format === OutputFormat.HTML) return html;
  if (!loaded.has(format)) {
    loaded.set(format, import(`../../presentation/presenters/formats/${format}.js`)
      .then(m => m.default)
      .catch(err => {
        if (err.code !== 'ERR_MODULE_NOT_FOUND') throw err;
        return html;
      }));
  }
  return loaded.get(format);
}

export function outputMiddleware(req, res) {
  const format = req.config?.outputFormat || OutputFormat.HTML;

  if (!req.scriptureResult) {
    return res.status(404).render('error', {
      message: 'Scripture not found',
      config: req.config
    });
  }

  presenterFor(format)
    .then(presenter => presenter.present(req.scriptureResult, req, res))
    .catch(err => {
      logError(err, { where: 'presenter', format, method: req.method, path: req.originalUrl });
      if (!res.headersSent) res.status(500).send('Internal error');
    });
}

export default outputMiddleware;
