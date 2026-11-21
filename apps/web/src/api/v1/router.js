// The v1 API and the simple format hosts. Runs before the site's routes; anything that isn't
// one of these hosts (or the /api/ and /json/ path shortcuts on other hosts) falls through.
import { Router } from 'express';
import { createHash } from 'crypto';
import apiRepository from '../../data/repositories/ApiRepository.js';
import { parseApiPath } from './path.js';
import { ApiError, isDatabaseError } from './errors.js';
import { buildPassage } from './passage.js';
import { buildParallel } from './parallel.js';
import { buildSearch } from './search.js';
import { pickRandomVerse } from './random.js';
import { buildVersions } from './versions.js';
import { renderSimple, renderError, renderUsage, CONTENT_TYPES } from './render.js';
import { logError } from '../../app/log.js';

// Subdomain → body kind (render.js)
const HOSTS = Object.freeze({
  api: 'api', json: 'json', yml: 'yaml', yaml: 'yaml', md: 'markdown', markdown: 'markdown', txt: 'text', plain: 'text',
});
const SHORTCUTS = Object.freeze({ api: 'api', json: 'json' });
// Service paths every host answers through the site's routes
const PASS = new Set(['/health', '/healthz', '/build-info', '/favicon.ico', '/robots.txt']);

const CACHE_OK = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400';
// Errors cache for 5 minutes. The version list is read once per process, so it changes only
// with a restart; a cached unknown_version lasts at most 5 minutes after one.
const CACHE_ERROR = 'public, max-age=300';
const CACHE_NONE = 'no-store';

// What api.scripture.guide/ and /v1/ answer
const API_INDEX = JSON.stringify({
  api: 'v1',
  docs: 'https://scripture.guide/SKILL.md',
  versions: 'https://api.scripture.guide/v1/versions',
  example: 'https://api.scripture.guide/v1/john3.16',
});
const API_ROOT = /^\/(v1\/?)?$/i;

// { kind, path } for a request this router serves, else null
export function hostKind(subdomain, path) {
  const kind = HOSTS[String(subdomain || '').toLowerCase()];
  if (kind) return { kind, path };
  const m = String(path).match(/^\/(api|json)(\/.*|)$/i);
  return m ? { kind: SHORTCUTS[m[1].toLowerCase()], path: m[2] || '/' } : null;
}

function send(req, res, kind, body, cacheControl) {
  res.set('X-API-Version', '1');
  res.set('Cache-Control', cacheControl);
  res.set('Content-Type', CONTENT_TYPES[kind]);
  // A strong ETag over the uncompressed body; res.send answers 304 itself when If-None-Match
  // matches it. compression() keeps the same ETag on the gzip and identity bodies. Cloudflare
  // weakens it (W/) when it re-encodes, and a weak If-None-Match still matches here.
  res.set('ETag', `"${createHash('sha1').update(body).digest('base64url')}"`);
  res.send(body);
}

const ONLY_ON_API = Object.freeze({
  search: ['search_not_supported', 'Search is only on api.scripture.guide.'],
  parallel: ['parallel_not_supported', 'Parallel is only on api.scripture.guide.'],
  versions: ['versions_not_supported', 'The version list is only on api.scripture.guide.'],
});

const DEFAULTS = { repo: apiRepository, buildPassage, buildParallel, buildSearch, pickRandomVerse, buildVersions };

export function apiRouter(deps = DEFAULTS) {
  const router = Router();
  router.get('*', async (req, res, next) => {
    const target = hostKind(req.subdomain, req.path);
    if (!target || PASS.has(req.path)) return next();
    const { kind } = target;
    if (kind === 'api' && API_ROOT.test(target.path)) return send(req, res, kind, API_INDEX, CACHE_OK);
    if (kind !== 'api' && target.path === '/') {
      const host = HOSTS[String(req.subdomain).toLowerCase()] ? String(req.subdomain).toLowerCase() : kind;
      return send(req, res, kind, renderUsage(kind, host), CACHE_OK);
    }
    try {
      const versions = await deps.repo.versions();
      const parsed = parseApiPath(target.path, versions);
      if (kind !== 'api' && ONLY_ON_API[parsed.kind]) throw new ApiError(...ONLY_ON_API[parsed.kind]);

      let data;
      let cache = CACHE_OK;
      if (parsed.kind === 'search') data = await deps.buildSearch(parsed);
      else if (parsed.kind === 'versions') data = await deps.buildVersions();
      else if (parsed.kind === 'parallel') data = await deps.buildParallel(parsed.query);
      else {
        let { reference } = parsed;
        if (parsed.kind === 'random') {
          reference = String(await deps.pickRandomVerse(parsed));
          cache = CACHE_NONE;
        }
        // The simple hosts take no options
        data = await deps.buildPassage({ reference, versions: parsed.versions, options: kind === 'api' ? parsed.options : [] });
      }
      const body = kind === 'api' ? JSON.stringify(data) : renderSimple(kind, data);
      send(req, res, kind, body, cache);
    } catch (caught) {
      let err = caught;
      // Anything else is logged and still answered in the v1 shape: a database failure as a 503
      // to retry, anything else (a bug) as a 500
      if (!(err instanceof ApiError)) {
        (deps.logError ?? logError)(err, { where: 'api', method: req.method, path: req.originalUrl });
        err = isDatabaseError(err)
          ? new ApiError('service_unavailable', 'The scripture database is not answering. Try again shortly.')
          : new ApiError('internal_error', 'Something went wrong on our side. It has been logged.');
      }
      res.status(err.status);
      if (err.status === 503) res.set('Retry-After', '30');
      send(req, res, kind, renderError(kind, err), err.status >= 500 ? CACHE_NONE : CACHE_ERROR);
    }
  });
  return router;
}

export default apiRouter;
