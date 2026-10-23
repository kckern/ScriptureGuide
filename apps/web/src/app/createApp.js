import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

import config from '../config/index.js';
import routes from './routes/index.js';
import subdomainMiddleware from './middleware/subdomain.js';
import { publicStatic, installPrivateFonts } from './middleware/static.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import { requestLog } from './middleware/requestLog.js';
import { responseHeaders } from './middleware/headers.js';
import { TRUST_PROXY } from './trustProxy.js';
import db from '../data/db/connection.js';

const VIEWS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../presentation/views');

// The Express app without listening (src/app.js listens; tests use it with supertest).
// log: one JSON line per request on stdout (off in tests by default).
export function createApp({ log = config.env !== 'test' } = {}) {
  const app = express();

  // req.ip is the visitor behind Cloudflare, the ALB and nginx-proxy-manager
  app.set('trust proxy', TRUST_PROXY);

  // Logging: first, so bytes is measured after compression() and duration covers every middleware.
  if (log) app.use(requestLog());

  // Security and cross-origin headers on every response (see middleware/headers.js)
  app.use(responseHeaders());

  // Compression
  app.use(compression());

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Cookies (preferences are client cookies; there are no server-side sessions)
  app.use(cookieParser());

  // Static files
  app.use(publicStatic());
  installPrivateFonts(app, config.fonts);

  // View engine
  app.set('view engine', 'ejs');
  app.set('views', VIEWS);

  // Inject ver_names globally for EJS templates
  let verNamesCache = null;
  app.use(async (req, res, next) => {
    if (!verNamesCache) {
      try {
        const rows = await db.query('SELECT id, title FROM scripture_versions ORDER BY priority, title');
        verNamesCache = {};
        for (const r of rows) verNamesCache[r.id] = r.title;
      } catch (e) {
        verNamesCache = {};
      }
    }
    res.locals.verNames = verNamesCache;
    next();
  });

  // Browser detection for body class (mirrors PHP lib.php.inc)
  app.use((req, res, next) => {
    const ua = req.headers['user-agent'] || '';
    if (ua.includes('Chrome') || ua.includes('CriOS')) res.locals.browserClass = 'chrome';
    else if (ua.includes('Firefox')) res.locals.browserClass = 'firefox';
    else res.locals.browserClass = 'ie';
    next();
  });

  // Subdomain parsing
  app.use(subdomainMiddleware);

  // Routes
  app.use('/', routes);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
