import 'dotenv/config';

// An integer environment value, 0 included; the default when unset or not a number
export function intEnv(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

// The licensed text font, served privately (never in the repository or the image; see docs/fonts.md).
//   FONT_BASE        URL or path the font is fetched from (no trailing slash needed)
//   FONT_DIR         a local directory to serve at /private-fonts; FONT_BASE defaults to that path
//   FONT_GOUDY_FILE  the file name under FONT_BASE (default scripture.woff2)
// Neither FONT_BASE nor FONT_DIR set: no @font-face for 'Goudy'; pages use Sorts Mill Goudy.
export function fontsFromEnv(env) {
  const dir = env.FONT_DIR || '';
  const base = (env.FONT_BASE || (dir ? '/private-fonts' : '')).replace(/\/+$/, '');
  return { base, dir, goudyFile: env.FONT_GOUDY_FILE || 'scripture.woff2' };
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,

  db: {
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'bom_prd',
    port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  },

  sphinx: {
    apiUrl: process.env.SPHINX_API || 'http://localhost:9312',
    // SphinxQL (MySQL protocol). Unset host: search falls back to MySQL.
    host: process.env.SPHINX_HOST || '',
    port: parseInt(process.env.SPHINX_PORT, 10) || 9306
  },

  // MySQL search fallback (no SPHINX_HOST): stop a search after this long or after reading about
  // this many rows, and show what was found so far as partial results. A full read of
  // scripture_verses is about 1.6 million rows and 2 s.
  search: {
    fallbackMaxMs: intEnv(process.env.SEARCH_FALLBACK_MAX_MS, 1500),
    fallbackMaxRows: intEnv(process.env.SEARCH_FALLBACK_MAX_ROWS, 1000000)
  },

  external: {
    coverHost: process.env.COVER_HOST || 'https://covers.scripture.guide',
    assetHost: process.env.ASSET_HOST || 'https://assets.scripture.guide'
  },

  fonts: fontsFromEnv(process.env),

  session: {
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    }
  }
};

export default config;
