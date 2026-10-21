// Pure helpers of the browser smoke suite (smoke.mjs), unit-tested in lib.test.mjs.

// The text-font families: live's body stack starts with 'Sorts Mill Goudy', 'Goudy'; Node's with
// 'Goudy Scripture', 'Sorts Mill Goudy'.
export const TEXT_FAMILIES = ['Goudy Scripture', 'Sorts Mill Goudy', 'Goudy'];

export const firstFamily = fontFamily => String(fontFamily).split(',')[0].trim().replace(/^["']|["']$/g, '');

// Connected regions of differing pixels in a pixelmatch diff image (RGBA; differing pixels are
// pure red, anti-aliasing yellow, the rest grey). Pixels at most `gap` apart (Chebyshev distance)
// join one region, so one shifted word or button reads as one region rather than many glyph-sized
// specks. Returns [{ x, y, w, h, pixels }], largest pixel count first.
export function diffRegions(data, width, height, { gap = 2 } = {}) {
  const red = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    if (data[o] === 255 && data[o + 1] === 0 && data[o + 2] === 0) red[i] = 1;
  }
  const seen = new Uint8Array(width * height);
  const regions = [];
  const stack = [];
  for (let start = 0; start < red.length; start++) {
    if (!red[start] || seen[start]) continue;
    seen[start] = 1;
    stack.push(start);
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, pixels = 0;
    while (stack.length) {
      const i = stack.pop();
      const x = i % width, y = (i - x) / width;
      pixels++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let ny = Math.max(0, y - gap); ny <= Math.min(height - 1, y + gap); ny++) {
        for (let nx = Math.max(0, x - gap); nx <= Math.min(width - 1, x + gap); nx++) {
          const j = ny * width + nx;
          if (red[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
        }
      }
    }
    regions.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, pixels });
  }
  return regions.sort((a, b) => b.pixels - a.pixels);
}

// Why a saved live screenshot cannot stand in for a fresh load, or null when it can. sidecar is
// the <name>.live.json written with the screenshot; expected holds this run's settings.
export function reuseProblem(sidecar, expected, now, maxAgeMs) {
  if (!sidecar) return 'no sidecar';
  for (const key of ['liveBase', 'path', 'fontMode', 'normalize', 'mask', 'viewport']) {
    if (JSON.stringify(sidecar[key] ?? null) !== JSON.stringify(expected[key] ?? null)) {
      return `${key} ${JSON.stringify(sidecar[key])} (now ${JSON.stringify(expected[key])})`;
    }
  }
  const t = Date.parse(sidecar.capturedAt);
  if (Number.isNaN(t)) return `capturedAt ${JSON.stringify(sidecar.capturedAt)} unreadable`;
  const age = now - t;
  if (age > maxAgeMs) return `${(age / 86400e3).toFixed(1)} days old (max ${(maxAgeMs / 86400e3).toFixed(1)})`;
  return null;
}

// SHARED_WITH_LIVE entries that excused a Node problem this run but matched nothing on any live
// load: live no longer has that problem, so Node should not either. Echo entries are judged
// through the entries they echo.
export function obsoleteShared(entries, hitOnNode, seenOnLive) {
  return entries.filter(e => !e.echo && hitOnNode.has(e) && !seenOnLive.has(e));
}
