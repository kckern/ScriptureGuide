import { parseHost, formatForSubdomain } from '../../domain/rules/requestParsing.js';

// Host-level parsing: the first label is the subdomain (output format); extra labels
// between it and the domain are flags (api.plain.scripture.guide → plain=1).
// Path shortcuts (/api/..., /img/...) are applied later by configMiddleware.
export function subdomainMiddleware(req, res, next) {
  const { subdomain, flags } = parseHost(req.headers.host || req.hostname || '');
  req.subdomain = subdomain;
  req.hostFlags = flags;
  req.outputFormat = formatForSubdomain(subdomain);
  next();
}

export default subdomainMiddleware;
