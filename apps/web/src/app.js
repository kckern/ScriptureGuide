import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

import config from './config/index.js';
import routes from './app/routes/index.js';
import subdomainMiddleware from './app/middleware/subdomain.js';
import { publicStatic, installPrivateFonts } from './app/middleware/static.js';
import { notFoundHandler, errorHandler } from './app/middleware/error.js';
import { requestLog } from './app/middleware/requestLog.js';
import { TRUST_PROXY } from './app/trustProxy.js';
import db from './data/db/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// req.ip is the visitor behind Cloudflare, the ALB and nginx-proxy-manager
app.set('trust proxy', TRUST_PROXY);

// Security headers
app.use(helmet({
  contentSecurityPolicy: false // Disable for now, configure properly later
}));

// Compression
app.use(compression());

// Logging: one JSON line per request on stdout
if (config.env !== 'test') {
  app.use(requestLog());
}

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
app.set('views', path.join(__dirname, 'presentation/views'));

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

// Start server
const PORT = config.port;

app.listen(PORT, () => {
  console.log(`Scripture Guide running on http://localhost:${PORT}`);
  console.log(`Environment: ${config.env}`);
});

export default app;
