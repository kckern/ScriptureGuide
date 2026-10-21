import { Router } from 'express';
import scriptureController from '../controllers/ScriptureController.js';
import configMiddleware from '../middleware/config.js';
import outputMiddleware from '../middleware/output.js';
import { ajaxRouter } from './ajax.js';
import { legacyRouter } from './legacy.js';

const router = Router();

// AJAX endpoints (vbox, passage, versionselect, settings, save_prefs), legacy .php URLs, /healthz
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

// Path-based format prefixes: /api/John3:16, /xml/John3:16, etc.
const FORMAT_PREFIXES = ['api', 'json', 'meta', 'raw', 'plain', 'markdown', 'xml', 'latex', 'notes', 'audio', 'cover'];
FORMAT_PREFIXES.forEach(fmt => {
  router.get(`/${fmt}/:reference(*)`,
    (req, res, next) => { req.outputFormat = fmt === 'json' ? 'api' : fmt; next(); },
    configMiddleware,
    (req, res, next) => scriptureController.show(req, res, next),
    outputMiddleware
  );
});

// Version-prefixed routes: /nrsv/john.18, /lds/d&c.84 (case-insensitive).
// Express 4 turns every "*" into "(.*)", even inside a param pattern, so "{0,}" keeps the
// version to the first segment. The dispatch reads req.config (parseRequest), not these params.
router.get('/:version([A-Za-z][A-Za-z0-9]{0,})/:reference(*)',
  (req, res, next) => { req.versionFromPath = req.params.version.toUpperCase(); next(); },
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
