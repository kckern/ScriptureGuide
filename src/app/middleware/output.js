import { OutputFormat } from '../../domain/enums/OutputFormat.js';
import HtmlPresenter from '../../presentation/presenters/HtmlPresenter.js';
import JsonPresenter from '../../presentation/presenters/JsonPresenter.js';

const presenters = {
  [OutputFormat.HTML]: new HtmlPresenter(),
  [OutputFormat.JSON]: new JsonPresenter()
  // TODO: Add other presenters as implemented
};

export function outputMiddleware(req, res) {
  const format = req.config?.outputFormat || OutputFormat.HTML;
  const presenter = presenters[format] || presenters[OutputFormat.HTML];

  if (!req.scriptureResult) {
    return res.status(404).render('error', {
      message: 'Scripture not found',
      config: req.config
    });
  }

  presenter.present(req.scriptureResult, req, res);
}

export default outputMiddleware;
