// The visitor's address. Express's req.ip walks X-Forwarded-For past trusted hops (trustProxy.js).
// Behind the Cloudflare Tunnel every hop the app sees is private (cloudflared → nginx → app), so
// req.ip ends up private and the visitor is in CF-Connecting-IP. That header is used only then:
// on any other path (CloudFront today, a direct hit) a visitor could send it themselves.
import net from 'node:net';
import proxyaddr from 'proxy-addr';

const isPrivate = proxyaddr.compile(['loopback', 'linklocal', 'uniquelocal']);

export function clientIp(req) {
  const hop = req?.ip ?? null;
  if (!hop) return null;
  const cf = req.headers?.['cf-connecting-ip'];
  if (cf && net.isIP(cf) && isPrivate(hop.replace(/^::ffff:/, ''), 0)) return cf;
  return hop;
}

export default clientIp;
