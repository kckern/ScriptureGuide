import { OutputFormat } from '../../domain/enums/OutputFormat.js';
import { coverRequest } from '../../presentation/presenters/formats/cover.js';

// Retired subdomains (empty or one-off PHP pages).
const GONE = new Set(['hub', 'slide']);

// Map subdomains to output formats
const SUBDOMAIN_FORMATS = {
  api: OutputFormat.API,
  json: OutputFormat.API,
  meta: OutputFormat.META,
  raw: OutputFormat.RAW,
  plain: OutputFormat.PLAIN,
  markdown: OutputFormat.MARKDOWN,
  xml: OutputFormat.XML,
  latex: OutputFormat.LATEX,
  notes: OutputFormat.NOTES,
  audio: OutputFormat.AUDIO,
  cover: OutputFormat.COVER,
};

// Known version prefixes (sample - expand as needed)
const VERSION_PREFIXES = new Set([
  'kjv', 'esv', 'niv', 'nasb', 'nlt', 'msg', 'nkjv', 'rsv', 'asv',
  'bom', 'dc', 'pogp'
]);

export function subdomainMiddleware(req, res, next) {
  const host = req.hostname || '';
  const parts = host.split('.');

  // Default values
  req.outputFormat = OutputFormat.HTML;
  req.defaultVersion = null;

  if (parts.length > 2) {
    const subdomain = parts[0].toLowerCase();

    if (GONE.has(subdomain)) {
      return res.status(410).type('text/plain').send(`${subdomain}.scripture.guide is no longer available.\n`);
    }
    if (subdomain === 'cover') {
      req.outputFormat = OutputFormat.COVER;
      return coverRequest(req, res, next);
    }

    // Check if subdomain is an output format
    if (SUBDOMAIN_FORMATS[subdomain]) {
      req.outputFormat = SUBDOMAIN_FORMATS[subdomain];
    }
    // Check if subdomain is a version prefix
    else if (VERSION_PREFIXES.has(subdomain)) {
      req.defaultVersion = subdomain.toUpperCase();
    }
  }

  next();
}

export default subdomainMiddleware;
