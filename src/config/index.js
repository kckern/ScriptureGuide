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
    apiUrl: process.env.SPHINX_API || 'http://localhost:9312'
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
