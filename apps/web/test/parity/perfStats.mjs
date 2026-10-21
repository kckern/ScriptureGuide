// Statistics for perf.mjs. Times are milliseconds to the last byte of the response.

// Flag a URL when Node's median is more than FLAG_RATIO times live's and more than FLAG_MS slower.
export const FLAG_RATIO = 1.5;
export const FLAG_MS = 300;

const round = x => Math.round(x * 10) / 10;

// Linear interpolation between the closest ranks (numpy's default).
export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return round(sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo));
}

export function summarize(values) {
  return { n: values.length, p50: percentile(values, 50), p95: percentile(values, 95) };
}

export function ratio(node, live) {
  return node == null || !live ? null : node / live;
}

export function isFlagged(node, live) {
  return live != null && node != null && node > FLAG_RATIO * live && node - live > FLAG_MS;
}

// Cached live timings ({ "<url>": { at, times } }), or null when they must be fetched.
export function cachedLive(cache, url, runs, { refresh = false } = {}) {
  const entry = cache[url];
  if (refresh || !entry || !Array.isArray(entry.times) || entry.times.length < runs) return null;
  return entry.times.slice(0, runs);
}

function group(urls) {
  const paired = urls.filter(u => u.live != null);
  return {
    node: summarize(urls.map(u => u.node)),
    live: summarize(paired.map(u => u.live)),
    // node and live on the same URLs, so URLs without a live time do not skew it
    ratio: ratio(percentile(paired.map(u => u.node), 50), percentile(paired.map(u => u.live), 50)),
    flagged: urls.filter(u => u.flagged).length,
  };
}

/**
 * @param {{format:string, path:string, node:number[], live:number[]|null}[]} results
 * Per URL: the median of its runs. Per format and overall: p50/p95 across those URL medians.
 */
export function report(results) {
  const urls = results.map(({ format, path, node, live }) => {
    const n = percentile(node, 50);
    const l = live?.length ? percentile(live, 50) : null;
    return { format, path, node: n, live: l, ratio: ratio(n, l), flagged: isFlagged(n, l) };
  });
  const formats = {};
  for (const f of new Set(urls.map(u => u.format))) formats[f] = group(urls.filter(u => u.format === f));
  return { urls, formats, overall: group(urls) };
}
