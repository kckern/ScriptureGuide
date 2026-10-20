import { parseRequest } from '../../domain/rules/requestParsing.js';

function rawQuery(req) {
  const url = req.originalUrl || req.url || '/';
  const i = url.indexOf('?');
  const query = {};
  if (i >= 0) {
    for (const [k, v] of new URLSearchParams(url.slice(i + 1))) {
      if (!(k in query)) query[k] = v;
    }
  }
  return query;
}

/**
 * Builds req.config from the request, following the PHP front controller (lib.php.inc).
 *
 * req.config:
 *   outputFormat   'html' | 'api' | 'meta' | ... (subdomain, /api/ /img/ /mp3/ shortcuts, or /<format>/ prefix)
 *   subdomain      first host label, or the path shortcut
 *   hostFlags      { flag: 1 } from extra host labels (api.plain.scripture.guide → { plain: 1 })
 *   options        every query key except q; empty value → 1 (?plain ?meta_only ?heads ?headings=0 ...)
 *   reference      the reference string to look up (or search terms / the parallel q)
 *   search         true for /search/<terms> or a reference with no digits
 *   parallel       true when q contains "~" (reference is then the whole q)
 *   cropped        true for the "=/" prefix
 *   versions       ordered [{ version, format }] from the URL (/kjv.1830*rebom/...) or ?version=
 *   versionSpec    the version segment as typed (PHP $url_version), or null
 *   version        first requested version, or undefined (the lookup picks a default by verse range)
 *   includeHeadings, includeVerseNumbers   rendering switches (?headings=0, ?versenums=0)
 */
export function configMiddleware(req, res, next) {
  const path = (req.originalUrl || req.url || '/').split('?')[0];
  const parsed = parseRequest({ host: req.headers.host || req.hostname || '', path, query: rawQuery(req) });
  const { options } = parsed;

  req.config = {
    ...parsed,
    version: parsed.versions[0]?.version,
    includeHeadings: options.headings === undefined ? true : !(options.headings === '0' || options.headings === ''),
    includeVerseNumbers: options.versenums !== '0',
    includeAnnotations: options.annotations === '1',
    includeMeta: options.meta === '1',
  };

  next();
}

export default configMiddleware;
