import { OutputFormat } from '../../domain/enums/OutputFormat.js';

// Map subdomains to output formats
const SUBDOMAIN_FORMATS = {
  api: OutputFormat.JSON,
  json: OutputFormat.JSON,
  xml: OutputFormat.XML,
  latex: OutputFormat.LATEX,
  plain: OutputFormat.PLAIN,
  markdown: OutputFormat.MARKDOWN,
  audio: OutputFormat.AUDIO,
  raw: OutputFormat.RAW
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
