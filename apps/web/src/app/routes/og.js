import { buildConfig } from '../middleware/config.js';
import scriptureController from '../controllers/ScriptureController.js';
import ogPresenter, { cachedCard, sendJpeg, sendSiteCard } from '../../presentation/presenters/formats/og.js';
import { isEmptyReference } from '../../domain/rules/requestParsing.js';
import { logError } from '../log.js';

// GET /og/<page path>.jpg: the link-preview card of the page at /<page path>, looked up as that
// page is (same config, same controller). Search, parallel, empty and unknown references, and
// any failure, answer the site card (/og/site.jpg), so a preview never breaks. The cards were
// PNGs at first: /og/<page path>.png answers the same JPEG, so links already shared keep working.
export async function ogRoute(req, res) {
  const pagePath = req.path.replace(/^\/og\/+/, '/').replace(/\.(jpe?g|png)$/i, '');
  try {
    const hit = cachedCard(pagePath);
    if (hit) return sendJpeg(res, await hit);
    if (pagePath === '/' || pagePath === '/site') return sendSiteCard(res);

    const config = buildConfig({ host: req.headers.host || '', path: pagePath });
    if (config.search || config.parallel || isEmptyReference(config.reference)) return sendSiteCard(res);
    req.config = { ...config, outputFormat: 'og' };
    req.ogKey = pagePath;
    await scriptureController.show(req, res, err => {
      if (err) {
        logError(err, { where: 'og lookup', path: req.originalUrl });
        return sendSiteCard(res);
      }
      return ogPresenter.present(req.scriptureResult, req, res);
    });
  } catch (err) {
    logError(err, { where: 'og', path: req.originalUrl });
    if (!res.headersSent) return sendSiteCard(res);
  }
}

export default ogRoute;
