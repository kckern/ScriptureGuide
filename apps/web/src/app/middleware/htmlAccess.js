// The access check for website pages (src/app/access). It counts and logs only: a page is never
// refused here and gets no RateLimit headers, whatever the mode. Cloudflare rate-limits pages
// at the edge.
// Skipped: the service paths, the Clicky analytics paths (clickyProxy.js), link-preview cards
// (/og/) and the AJAX endpoints a page calls (routes/ajax.js), so one page view counts once; and the legacy .php URLs (routes/legacy.js),
// which redirect to a page that is counted itself. Express matches the named routes
// case-insensitively, and so does this; the .php pattern is legacy.js's own.
import { logError } from '../log.js';

const SKIP = /^\/(?:(?:health|healthz|build-info|vbox|passage|versionselect|settings|save_prefs|cd7dba44d5\.js|e9b1e2e71a)\/?$|og\/)/i;
const LEGACY_PHP = /^\/[A-Za-z0-9_-]+\.php$/;

export function htmlAccess(access) {
  return async function htmlAccessMiddleware(req, res, next) {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || SKIP.test(req.path) || LEGACY_PHP.test(req.path)) return next();
    try {
      req.access = await access.check(req, { scope: 'html' });
    } catch (err) {
      logError(err, { where: 'html access', method: req.method, path: req.originalUrl });
    }
    next();
  };
}

export default htmlAccess;
