export function notFoundHandler(req, res, next) {
  res.status(404).render('error', {
    message: 'Page not found',
    status: 404,
    config: req.config || {}
  });
}

export function errorHandler(err, req, res, next) {
  console.error('Error:', err);

  const status = err.status || 500;
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
}

export default { notFoundHandler, errorHandler };
