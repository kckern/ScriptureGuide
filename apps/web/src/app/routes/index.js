import { Router } from 'express';
import scriptureController from '../controllers/ScriptureController.js';
import configMiddleware from '../middleware/config.js';
import outputMiddleware from '../middleware/output.js';
import { ajaxRouter } from './ajax.js';
import { legacyRouter } from './legacy.js';
import { buildInfo } from '../buildInfo.js';
import { ogRoute } from './og.js';

const router = Router();

// AJAX endpoints (vbox, passage, versionselect; settings and save_prefs answer 410), legacy .php URLs, /healthz
router.use(ajaxRouter());
router.use(legacyRouter());

// Home page
router.get('/', (req, res, next) => {
  configMiddleware(req, res, () => {
    scriptureController.home(req, res);
  });
});

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// What build is live: commit, CI run, image digest, package versions. Never cached.
router.get('/build-info', (req, res) => {
  res.set('Cache-Control', 'no-store').json(buildInfo());
});

// Link-preview cards: /og/<page path>.jpg (og:image of each passage page), /og/site.jpg
router.get('/og/*', ogRoute);

// Path-based format prefixes: /xml/John3:16, /meta/John3:16, etc. (/api/ and /json/ are
// served by the v1 API router, src/api/v1/router.js.)
const FORMAT_PREFIXES = ['meta', 'raw', 'plain', 'markdown', 'xml', 'latex', 'notes', 'audio', 'cover'];
FORMAT_PREFIXES.forEach(fmt => {
  router.get(`/${fmt}/:reference(*)`,
    (req, res, next) => { req.outputFormat = fmt; next(); },
    configMiddleware,
    (req, res, next) => scriptureController.show(req, res, next),
    outputMiddleware
  );
});

// Version-prefixed routes: /nrsv/john.18, /lds/d&c.84 (case-insensitive).
// Express 4 turns every "*" into "(.*)", even inside a param pattern, so "{0,}" keeps the
// version to the first segment. The dispatch reads req.config (parseRequest), not these params.
router.get('/:version([A-Za-z][A-Za-z0-9]{0,})/:reference(*)',
  configMiddleware,
  (req, res, next) => scriptureController.show(req, res, next),
  outputMiddleware
);

// Scripture lookup - must be last due to wildcard
router.get('/:reference(*)',
  configMiddleware,
  (req, res, next) => scriptureController.show(req, res, next),
  outputMiddleware
);

export default router;
