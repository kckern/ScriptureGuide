// One JSON line per request on stdout, for the container log shipper.
// Fields: time, msg:'request', method, host, path, status, bytes, duration_ms, format, ua, referer,
// ip, client_ip, cf_ray, xff, and from the access check (req.access, src/app/access) caller, tier,
// over and refused, null when the request wasn't checked; aborted:true when the client went away
// before the response finished (status is then null unless the headers had already gone out).
// bytes counts the body bytes written to the socket (nginx's $body_bytes_sent). Register this before
// compression() so the count is the compressed size.
// ip is Express's req.ip (the last untrusted hop); client_ip is the visitor (clientIp.js), which
// differs only when the request came through the Cloudflare Tunnel with CF-Connecting-IP.

import { writeLine } from '../log.js';
import { clientIp } from '../clientIp.js';

// Not logged: health checks and the Clicky analytics script and beacon (clickyProxy.js)
const SKIP = new Set(['/health', '/healthz', '/cd7dba44d5.js', '/e9b1e2e71a']);

export function requestLog({ write = writeLine } = {}) {
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
        client_ip: clientIp(req),
        cf_ray: req.headers['cf-ray'] ?? null,
        xff: req.headers['x-forwarded-for'] ?? null,
        caller: req.access?.caller ?? null,
        tier: req.access?.tier ?? null,
        over: req.access?.over ?? null,
        refused: req.access?.refused ?? null
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
