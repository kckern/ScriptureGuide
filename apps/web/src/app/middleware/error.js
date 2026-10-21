import { stdoutLine } from './requestLog.js';

export function notFoundHandler(req, res, next) {
  res.status(404).render('error', {
    message: 'Page not found',
    status: 404,
    config: req.config || {}
  });
}

// Logs one JSON line per error (msg:'error'), then answers with JSON or the error page.
export function createErrorHandler({ write = stdoutLine } = {}) {
  return function errorHandler(err, req, res, next) {
    const status = err.status || 500;
    try {
      write(JSON.stringify({
        time: new Date().toISOString(),
        msg: 'error',
        method: req.method,
        path: req.originalUrl,
        status,
        error: err?.message ?? String(err),
        stack: err?.stack ?? null
      }));
    } catch { /* logging never breaks a response */ }

    const message = process.env.NODE_ENV === 'production'
      ? 'An error occurred'
      : err.message;

    // Check if request wants JSON
    if (req.config?.outputFormat === 'api' || req.accepts('json')) {
      return res.status(status).json({
        error: message,
        status
      });
    }

    res.status(status).render('error', {
      message,
      status,
      stack: process.env.NODE_ENV === 'development' ? err.stack : null,
      config: req.config || {}
    });
  };
}

export const errorHandler = createErrorHandler();

export default { notFoundHandler, errorHandler };
