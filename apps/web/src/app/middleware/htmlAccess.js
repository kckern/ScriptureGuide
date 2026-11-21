// The access check for website pages (src/app/access). It counts and logs only: a page is never
// refused here and gets no RateLimit headers, whatever the mode. Cloudflare rate-limits pages
// at the edge.
// Skipped: the service paths, link-preview cards (/og/) and the AJAX endpoints a page calls
// (routes/ajax.js), so one page view counts once. Express matches routes case-insensitively,
// and so does this.
import { logError } from '../log.js';

const SKIP = /^\/(?:(?:health|healthz|build-info|vbox|passage|versionselect|settings|save_prefs)\/?$|og\/)/i;

export function htmlAccess(access) {
  return async function htmlAccessMiddleware(req, res, next) {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || SKIP.test(req.path)) return next();
    try {
      req.access = await access.check(req, { scope: 'html' });
    } catch (err) {
      logError(err, { where: 'html access', method: req.method, path: req.originalUrl });
    }
    next();
  };
}

export default htmlAccess;
