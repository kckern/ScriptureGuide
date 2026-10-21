import 'dotenv/config';

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
    fallbackMaxMs: parseInt(process.env.SEARCH_FALLBACK_MAX_MS, 10) || 1500,
    fallbackMaxRows: parseInt(process.env.SEARCH_FALLBACK_MAX_ROWS, 10) || 1000000
  },

  external: {
    coverHost: process.env.COVER_HOST || 'https://covers.scripture.guide',
    assetHost: process.env.ASSET_HOST || 'https://assets.scripture.guide'
  },

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
