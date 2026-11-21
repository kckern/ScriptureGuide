import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

import config from '../config/index.js';
import routes from './routes/index.js';
import subdomainMiddleware from './middleware/subdomain.js';
import { publicStatic, privacyPolicy } from './middleware/static.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import { requestLog } from './middleware/requestLog.js';
import { responseHeaders } from './middleware/headers.js';
import { apiRouter } from '../api/v1/router.js';
import { TRUST_PROXY } from './trustProxy.js';
import { commit } from './buildInfo.js';
import db from '../data/db/connection.js';

const VIEWS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../presentation/views');

// res.locals.verNames (id → title) for the EJS templates. Read once; a failed read leaves
// {} for this request and is tried again on the next one.
export function versionNames(database = db) {
  let cache = null;
  return async (req, res, next) => {
    if (!cache) {
      try {
        const rows = await database.query('SELECT id, title FROM scripture_versions ORDER BY priority, title');
        cache = {};
        for (const r of rows) cache[r.id] = r.title;
      } catch {
        // cache stays null
      }
    }
    res.locals.verNames = cache ?? {};
    next();
  };
}

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
  app.use(privacyPolicy());

  // View engine
  app.set('view engine', 'ejs');
  app.set('views', VIEWS);

  // Inject ver_names globally for EJS templates
  app.use(versionNames());

  // Asset URLs carry the build's commit (layouts/main.ejs), so a deploy reaches cached browsers at once
  app.use((req, res, next) => {
    res.locals.assetVersion = commit();
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

  // The v1 API (api.) and the simple format hosts (json., yml., md., txt., plain.)
  app.use(apiRouter());

  // Routes
  app.use('/', routes);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
