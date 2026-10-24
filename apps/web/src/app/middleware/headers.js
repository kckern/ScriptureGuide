import helmet from 'helmet';

// Response headers for every format, page and asset (owner decision #29, 2026-10-22).
// Scripture text, covers and API output are public and meant to be used by other sites:
//   - Access-Control-Allow-Origin: * on everything, as live sends it, so pages and APIs can be
//     fetched cross-site (no credentials: the site has no sessions)
//   - Cross-Origin-Resource-Policy: cross-origin (helmet's default, same-origin, would stop
//     other sites embedding covers, images and API output)
//   - no Cross-Origin-Opener-Policy: live sends none, and same-origin severs window.opener
//     between a page and the popups it opens or is opened from (main.js opens notes and
//     facsimile popups; other sites open passages in popups)
// Kept from helmet: Strict-Transport-Security, X-Frame-Options: SAMEORIGIN, nosniff and the
// rest. HSTS without includeSubDomains: pages link http://img.350.scripture.guide (and other
// image hosts), whose TLS fails (two levels deep, outside the *.scripture.guide certificate);
// a browser that had seen includeSubDomains would upgrade those links and lose the images. Origin-Agent-Cluster: ?1 is kept: it only stops a page setting document.domain, which
// nothing here does. Referrer-Policy: no-referrer is kept: it only limits what our pages send.
// contentSecurityPolicy stays off until it is configured for the page's inline scripts.
const securityHeaders = helmet({
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  strictTransportSecurity: { includeSubDomains: false },
});

function allowAnyOrigin(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
}

export function responseHeaders() {
  return [securityHeaders, allowAnyOrigin];
}

export default responseHeaders;
