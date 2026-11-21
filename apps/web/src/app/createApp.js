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
import { htmlAccess } from './middleware/htmlAccess.js';
import { clickyProxy, CLICKY_SITE_ID } from './middleware/clickyProxy.js';
import { createAccess } from './access/access.js';
import { TRUST_PROXY } from './trustProxy.js';
import { commit } from './buildInfo.js';
import { logError } from './log.js';
import db from '../data/db/connection.js';

const VIEWS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../presentation/views');

// res.locals.verNames (id → title) for the EJS templates. Read once: concurrent requests share
// the read in flight. A failed read is logged, leaves {} for the requests waiting on it and is
// tried again on the next one.
export function versionNames(database = db, log = logError) {
  let pending = null;
  const load = async () => {
    const rows = await database.query('SELECT id, title FROM scripture_versions ORDER BY priority, title');
    const names = {};
    for (const r of rows) names[r.id] = r.title;
    return names;
  };
  return async (req, res, next) => {
    pending ??= load().catch(err => {
      pending = null;
      log(err, { where: 'version names' });
      return null;
    });
    res.locals.verNames = (await pending) ?? {};
    next();
  };
}

// The Express app without listening (src/app.js listens; tests use it with supertest).
// log: one JSON line per request on stdout (off in tests by default).
// access: the access check (src/app/access), one instance shared by the API and the website
// pages so both count against the same buckets; tests can pass their own.
// clicky: the Clicky analytics proxy (middleware/clickyProxy.js); analytics: whether pages carry
// the Clicky tag (production only).
export function createApp({
  log = config.env !== 'test',
  access = createAccess({ mode: config.accessMode }),
  clicky = clickyProxy(),
  analytics = config.env === 'production'
} = {}) {
  const app = express();

  // req.ip is the visitor behind Cloudflare, the ALB and nginx-proxy-manager
  app.set('trust proxy', TRUST_PROXY);

  // Logging: first, so bytes is measured after compression() and duration covers every middleware.
  if (log) app.use(requestLog());

  // Security and cross-origin headers on every response (see middleware/headers.js)
  app.use(responseHeaders());

  // Compression
  app.use(compression());

  // Clicky analytics script and beacon, on every host: ahead of the body parsers so a beacon
  // POST is relayed unparsed, and ahead of the API and site routes
  app.use(clicky);

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Cookies (preferences are client cookies; there are no server-side sessions)
  app.use(cookieParser());

  // Static files. They come before the API router on purpose: every host serves them, so
  // api.scripture.guide/SKILL.md (the docs the API index links) is the file, not a lookup.
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
    res.locals.clickyId = analytics ? CLICKY_SITE_ID : null;
    // Clicky goes through the same-origin proxy; ?clicky=direct loads its standard script, for comparing
    res.locals.clickyProxy = req.query?.clicky !== 'direct';
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
  app.use(apiRouter({ access }));

  // Website pages: counted and logged by the access check, never refused (htmlAccess.js)
  app.use(htmlAccess(access));

  // Routes
  app.use('/', routes);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
