// Express 'trust proxy' for production: Cloudflare edge -> AWS ALB -> nginx-proxy-manager -> app.
// The ALB and NPM are private addresses, the Cloudflare edge is one of Cloudflare's ranges, so
// req.ip walks X-Forwarded-For from the right past those hops to the visitor. A hop outside
// these ranges (traffic that bypassed Cloudflare) stops the walk, so a forged leftmost
// X-Forwarded-For entry is never used.
//
// Known gap (X-Real-IP): nginx-proxy-manager sets `real_ip_header X-Real-IP` globally and trusts
// the ALB, so a visitor who sends their own X-Real-IP has it replace the ALB hop in $remote_addr,
// which NPM then appends to X-Forwarded-For: "<visitor>, <cloudflare edge>, <forged>". The forged
// address is the first untrusted hop, so req.ip reports it. This only affects log accuracy (nothing
// authorizes on req.ip); the request log keeps the raw chain in `xff` and the `cf_ray` id. The fix
// is upstream: strip X-Real-IP from visitor requests at Cloudflare (a request header transform
// rule on the scripture.guide zone).
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
