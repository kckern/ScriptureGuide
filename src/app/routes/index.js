import { Router } from 'express';
import scriptureController from '../controllers/ScriptureController.js';
import configMiddleware from '../middleware/config.js';
import outputMiddleware from '../middleware/output.js';
import scriptureLookupService from '../../services/ScriptureLookupService.js';
import verseRepository from '../../data/repositories/VerseRepository.js';
import HtmlPresenter from '../../presentation/presenters/HtmlPresenter.js';

const presenter = new HtmlPresenter();
const router = Router();

// Version selector — returns <img class="option"> HTML for available versions
router.post('/versionselect', async (req, res) => {
  try {
    const { ver, ref, seq } = req.body;
    const result = await scriptureLookupService.lookup(ref, { version: ver, includeHeadings: false });
    const verseIds = result.reference.verseIds;
    const versions = await verseRepository.findAvailableVersions(verseIds);
    const coverHost = 'https://img.scripture.guide/covers';

    const html = versions
      .filter(v => v.id !== ver)
      .map(v => {
        const img = v.id.replace(/\*.*$/, '').toLowerCase();
        return `<img class="option" src="${coverHost}/${img}.jpg" title="${v.title}" ver="${v.id}" seq="${seq || 0}">`;
      })
      .join('\n');

    res.send(html);
  } catch (err) {
    res.status(500).send('');
  }
});

// Passage AJAX — returns h3 + verses HTML for replacePassage()
router.get('/passage', async (req, res) => {
  try {
    const { ref, version } = req.query;
    const config = { version: version || 'KJV', includeHeadings: true, includeVerseNumbers: true };
    const result = await scriptureLookupService.lookup(ref, config);
    const data = presenter.serialize(result);
    res.render('partials/passage', { data, config: result.config });
  } catch (err) {
    res.status(500).send('');
  }
});

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
const FORMAT_PREFIXES = ['api', 'json', 'xml', 'plain', 'markdown', 'latex', 'raw', 'audio'];
FORMAT_PREFIXES.forEach(fmt => {
  router.get(`/${fmt}/:reference(*)`,
    (req, res, next) => { req.outputFormat = fmt === 'api' ? 'json' : fmt; next(); },
    configMiddleware,
    (req, res, next) => scriptureController.show(req, res, next),
    outputMiddleware
  );
});

// Version-prefixed routes: /nrsv/john.18, /lds/d&c.84 (case-insensitive)
router.get('/:version([A-Za-z][A-Za-z0-9]*)/:reference(*)',
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
