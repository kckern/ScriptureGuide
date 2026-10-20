import { parseHost, formatForSubdomain } from '../../domain/rules/requestParsing.js';
import { coverRequest } from '../../presentation/presenters/formats/cover.js';

// Retired subdomains (empty or one-off PHP pages).
const GONE = new Set(['hub', 'slide']);

// Host-level parsing: the first label is the subdomain (output format); extra labels
// between it and the domain are flags (api.plain.scripture.guide → plain=1).
// Path shortcuts (/api/..., /img/...) are applied later by configMiddleware.
export function subdomainMiddleware(req, res, next) {
  const { subdomain, flags } = parseHost(req.headers.host || req.hostname || '');
  if (GONE.has(subdomain)) {
    return res.status(410).type('text/plain').send(`${subdomain}.scripture.guide is no longer available.\n`);
  }
  req.subdomain = subdomain;
  req.hostFlags = flags;
  req.outputFormat = formatForSubdomain(subdomain);
  if (subdomain === 'cover') return coverRequest(req, res, next);
  next();
}

export default subdomainMiddleware;
