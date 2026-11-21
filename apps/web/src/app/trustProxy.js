// Express 'trust proxy' for production. Today the chain is CloudFront -> nginx on bom -> app.
// nginx and the Docker network are private addresses and trusted; CloudFront's ranges are not
// listed, so req.ip stops at the CloudFront edge address rather than the visitor. Cloudflare's
// ranges are listed for the planned move to Cloudflare (Cloudflare Tunnel -> nginx -> app), where
// every hop the app sees is private and the visitor comes from CF-Connecting-IP (see clientIp.js).
// req.ip walks X-Forwarded-For from the right past trusted hops; the first untrusted hop stops
// the walk, so a forged leftmost X-Forwarded-For entry is never used.
//
// Known gap (X-Real-IP): nginx on bom is nginx-proxy-manager, which sets `real_ip_header X-Real-IP`
// globally. When the hop in front of it is one it trusts (set_real_ip_from), a visitor who sends
// their own X-Real-IP has it replace $remote_addr, which nginx then appends to X-Forwarded-For:
// "<visitor>, <forged>". The forged address is the first untrusted hop, so req.ip reports it.
// req.ip now decides the rate-limit identity (clientIp.js, src/app/access/): a forged X-Real-IP
// would let a caller pick their own bucket, and after the move to Cloudflare a public forged value
// also turns off CF-Connecting-IP. So X-Real-IP must be stripped from visitor requests at the edge
// (CloudFront today; a request header transform rule on the Cloudflare zone after the move). The
// request log keeps the raw chain in `xff`.
//
// Cloudflare ranges: https://api.cloudflare.com/client/v4/ips (keep in step with the proxy config).
export const CLOUDFLARE_RANGES = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
  '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
  '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
  '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32'
];

export const TRUST_PROXY = ['loopback', 'linklocal', 'uniquelocal', ...CLOUDFLARE_RANGES];

export default TRUST_PROXY;
