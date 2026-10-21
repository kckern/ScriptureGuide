// One JSON line per request on stdout, for the container log shipper.
// Fields: time, msg:'request', method, host, path, status, bytes, duration_ms, format, ua, referer, ip;
// aborted:true when the client went away before the response finished.

const SKIP = new Set(['/health', '/healthz']);

export function stdoutLine(line) {
  process.stdout.write(line + '\n');
}

export function requestLog({ write = stdoutLine } = {}) {
  return function requestLogMiddleware(req, res, next) {
    if (SKIP.has(req.path)) return next();
    const start = process.hrtime.bigint();
    let logged = false;
    const log = aborted => {
      if (logged) return;
      logged = true;
      const length = parseInt(res.getHeader('content-length'), 10);
      const rec = {
        time: new Date().toISOString(),
        msg: 'request',
        method: req.method,
        host: req.headers.host ?? null,
        path: req.originalUrl,
        status: res.statusCode,
        bytes: Number.isFinite(length) ? length : null,
        duration_ms: Math.round(Number(process.hrtime.bigint() - start) / 1e4) / 100,
        format: req.config?.outputFormat ?? req.outputFormat ?? null,
        ua: req.headers['user-agent'] ?? null,
        referer: req.headers.referer ?? null,
        ip: req.ip ?? null
      };
      if (aborted) rec.aborted = true;
      try { write(JSON.stringify(rec)); } catch { /* logging never breaks a response */ }
    };
    res.on('finish', () => log(false));
    res.on('close', () => log(!res.writableFinished));
    next();
  };
}

export default requestLog;
