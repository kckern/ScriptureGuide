// Express 'trust proxy' for production: Cloudflare edge -> AWS ALB -> nginx-proxy-manager -> app.
// The ALB and NPM are private addresses, the Cloudflare edge is one of Cloudflare's ranges, so
// req.ip walks X-Forwarded-For from the right past those hops to the visitor. A hop outside
// these ranges (traffic that bypassed Cloudflare) stops the walk, so a forged leftmost
// X-Forwarded-For entry is never used.
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
