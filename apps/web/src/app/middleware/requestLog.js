// One JSON line per request on stdout, for the container log shipper.
// Fields: time, msg:'request', method, host, path, status, bytes, duration_ms, format, ua, referer,
// ip, cf_ray, xff; aborted:true when the client went away before the response finished (status is
// then null unless the headers had already gone out).
// bytes counts the body bytes written to the socket (nginx's $body_bytes_sent). Register this before
// compression() so the count is the compressed size.

const SKIP = new Set(['/health', '/healthz']);

export function stdoutLine(line) {
  process.stdout.write(line + '\n');
}

export function requestLog({ write = stdoutLine } = {}) {
  return function requestLogMiddleware(req, res, next) {
    if (SKIP.has(req.path)) return next();
    const start = process.hrtime.bigint();
    let logged = false;
    let bytes = 0;
    const count = (chunk, encoding) => {
      if (chunk == null || typeof chunk === 'function') return;
      bytes += typeof chunk === 'string'
        ? Buffer.byteLength(chunk, typeof encoding === 'string' ? encoding : 'utf8')
        : chunk.length;
    };
    const resWrite = res.write;
    const resEnd = res.end;
    res.write = function (chunk, encoding, cb) {
      count(chunk, encoding);
      return resWrite.call(this, chunk, encoding, cb);
    };
    res.end = function (chunk, encoding, cb) {
      count(chunk, encoding);
      return resEnd.call(this, chunk, encoding, cb);
    };
    const log = aborted => {
      if (logged) return;
      logged = true;
      const rec = {
        time: new Date().toISOString(),
        msg: 'request',
        method: req.method,
        host: req.headers.host ?? null,
        path: req.originalUrl,
        status: aborted && !res.headersSent ? null : res.statusCode,
        bytes: req.method === 'HEAD' ? 0 : bytes,
        duration_ms: Math.round(Number(process.hrtime.bigint() - start) / 1e4) / 100,
        format: req.config?.outputFormat ?? req.outputFormat ?? null,
        ua: req.headers['user-agent'] ?? null,
        referer: req.headers.referer ?? null,
        ip: req.ip ?? null,
        cf_ray: req.headers['cf-ray'] ?? null,
        xff: req.headers['x-forwarded-for'] ?? null
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
