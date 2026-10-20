# Parity Gaps Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the gaps between "server output matches on a 167-request corpus" and "the Node app can replace the PHP site": static assets, real-traffic coverage, browser behavior, Sphinx search, structured logs, and a staging run.

**Architecture:** Extend the existing parity harness (`apps/web/test/parity`) with an `asset` format and a traffic-derived corpus; add a Playwright smoke suite that drives the live PHP site and the local Node app side by side; add a CI check that Sphinx and the MySQL fallback return the same results on the seeds; switch request logging to one JSON line per request.

**Tech Stack:** Node 20, vitest, the existing harness, Playwright (chromium) + pixelmatch, morgan, Docker Compose.

**Prerequisites:** local full database copy on `127.0.0.1:3310` (see `apps/web/test/parity/README.md`), app on `PORT=3101`.

---

### Task 1: Asset parity in the harness

**Files:**
- Modify: `apps/web/test/parity/run.mjs` (canonical() and the live/local fetch for binary bodies)
- Modify: `apps/web/test/parity/corpus.mjs`
- Test: `apps/web/test/parity/normalize.test.js`

**Step 1: Failing test** — add to `normalize.test.js`:

```js
import { canonicalAsset } from './normalize.mjs';

describe('canonicalAsset', () => {
  test('text assets ignore CRLF and trailing whitespace', () => {
    expect(canonicalAsset('text/css', Buffer.from('a {}\r\nb {}  \r\n'))).toBe(canonicalAsset('text/css', Buffer.from('a {}\nb {}\n')));
  });
  test('binary assets compare by sha256', () => {
    expect(canonicalAsset('font/woff', Buffer.from([1, 2, 3]))).toMatch(/^sha256 [0-9a-f]{64} 3 bytes$/);
  });
});
```

Run `cd apps/web && npx vitest run test/parity/normalize.test.js` → FAIL (no export).

**Step 2: Implement** in `normalize.mjs`:

```js
import { createHash } from 'node:crypto';

const TEXTUAL = /^(text\/|application\/(javascript|json|xml))/;

// CSS/JS are compared as text (line endings and trailing spaces ignored); fonts and images by hash.
export function canonicalAsset(type, buf) {
  if (TEXTUAL.test(type)) return buf.toString('utf8').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trimEnd();
  return `sha256 ${createHash('sha256').update(buf).digest('hex')} ${buf.length} bytes`;
}
```

In `run.mjs`, keep bodies as Buffers (`Buffer.concat(chunks)`; cache binary bodies base64-encoded), and add `case 'asset': return canonicalAsset(res.type.split(';')[0], res.buf);`.

**Step 3:** `npx vitest run test/parity/normalize.test.js` → PASS.

**Step 4: Asset corpus.** In `corpus.mjs` add an `ASSETS` list built from what live pages reference. Generate it once:

```bash
cd apps/web && node -e "
const fs=require('fs');const dir='test/parity/.cache/live/';const s=new Set();
for (const f of fs.readdirSync(dir)) { const b=JSON.parse(fs.readFileSync(dir+f)).body||'';
  for (const m of b.matchAll(/(?:src|href)=[\"'](\/[^\"'?#]+\.(?:js|css|png|jpg|svg|gif|ico))/g)) s.add(m[1]); }
console.log(JSON.stringify([...s].sort(),null,1))"
```

Then add every `url(...)` font referenced by the live CSS files (`curl -s https://scripture.guide/css/style.css | grep -o "url([^)]*)"`, same for the other CSS files). Export `...ASSETS.map(p => ['asset', p])` in `corpus`.

**Step 5: Baseline:** `node test/parity/run.mjs --format asset`. Expected failures: `js/main.js`, `css/style.css`, `css/versions.css`, and every font under `css/webfont/` (404 locally).

**Step 6: Commit** `test(web): asset parity in the harness`.

### Task 2: Sync code assets from live

**Files:**
- Modify: `apps/web/public/js/main.js`, `apps/web/public/css/style.css`, `apps/web/public/css/versions.css` (and any other file Task 1 flags, except fonts)
- Test: `apps/web/test/unit/staticAssets.test.js`

**Step 1: Failing test** guarding the two known regressions in the Node copy of `main.js`:

```js
import { readFileSync } from 'node:fs';
import { describe, test, expect } from 'vitest';

const main = readFileSync(new URL('../../public/js/main.js', import.meta.url), 'utf8');

describe('public/js/main.js', () => {
  test('cover images come from media.scripture.guide', () => {
    expect(main).not.toContain('img.scripture.guide/covers');
    expect(main).toContain('https://media.scripture.guide/covers/');
  });
  test('facsimile popups do not point at the fax host (it has no DNS)', () => {
    expect(main).not.toContain('fax.scripture.guide');
  });
});
```

Run → FAIL.

**Step 2:** For each flagged text asset: `curl -s https://scripture.guide/<path> | tr -d '\r' > apps/web/public/<path>`. Review `git diff` hunk by hunk: keep the live behavior; if a Node-side change was deliberate (check `git log -p` for that file), keep it and note why in the commit message.

**Step 3:** vitest → PASS; `node test/parity/run.mjs --format asset` → only fonts fail; full harness still 0 fail.

**Step 4: Commit** `fix(web): sync main.js, style.css, versions.css with live`.

### Task 3: Fonts (decision gate)

**Files:** `apps/web/public/css/webfont/*` or `apps/web/src/config/index.js` + CSS URL rewrite

**Step 1: Identify each font** referenced by the live CSS: download to a scratch dir, then `python3 -m pip install fonttools` and

```bash
for f in *.ttf *.woff; do python3 -c "
import sys; from fontTools.ttLib import TTFont; n=TTFont(sys.argv[1])['name']
g=lambda i: (n.getDebugName(i) or '')[:80]; print(sys.argv[1], '|', g(4), '|', g(0), '|', g(13))" "$f"; done
```

(name IDs: 4 full name, 0 copyright, 13 license).

**Step 2: Decide per font** and record in `apps/web/docs/fonts.md` (license text beside the fonts in `apps/web/public/css/webfont/OFL.txt`):
- SIL OFL, GPL-with-font-exception, or an explicit free-redistribution license → commit the file.
- Anything else → do not commit. Serve it from `FONT_BASE` (default `https://media.scripture.guide/fonts`) by rewriting its `url()` in the served CSS, and list it for the owner to upload.

**Step 3:** Asset harness → fonts pass (committed) or are allow-listed with reason "served from FONT_BASE".

**Step 4: Commit** `fix(web): web fonts (licensed redistributable ones committed; others via FONT_BASE)`.

### Task 4: Traffic corpus from access logs

**Files:**
- Create: `apps/web/test/parity/traffic.mjs`, `apps/web/test/parity/traffic.test.js`
- Modify: `apps/web/test/parity/run.mjs` (`--corpus traffic` reads `.cache/traffic.json`)

Log lines (nginx-proxy-manager, proxy host for `scripture.guide` and `*.scripture.guide`) look like:

```
[20/Oct/2026:22:41:07 +0000] BYPASS 200 200 - GET http scripture.guide "/erbom/1.nephi.16:7" [Client 203.0.113.9] [Length 2711] [Gzip -] [Sent-to php] "Mozilla/5.0 …" "-"
```

**Step 1: Failing tests** in `traffic.test.js`:

```js
import { describe, test, expect } from 'vitest';
import { parseLine, shapeOf, sample } from './traffic.mjs';

const line = '[20/Oct/2026:22:41:07 +0000] BYPASS 200 200 - GET http api.scripture.guide "/kjv/john.3.16" [Client 203.0.113.9] [Length 2711] [Gzip -] [Sent-to php] "Mozilla/5.0" "-"';

describe('traffic corpus', () => {
  test('parses method, status, host and path', () => {
    expect(parseLine(line)).toEqual({ method: 'GET', status: 200, host: 'api.scripture.guide', path: '/kjv/john.3.16' });
  });
  test('ignores static files and non-GET', () => {
    expect(parseLine(line.replace('/kjv/john.3.16', '/js/main.js'))).toBeNull();
    expect(parseLine(line.replace(' GET ', ' POST '))).toBeNull();
  });
  test('shape abstracts references so similar requests group together', () => {
    expect(shapeOf('/kjv/john.3.16')).toBe(shapeOf('/niv/gen.1.1'));
    expect(shapeOf('/john.3.16-18')).not.toBe(shapeOf('/john.3.16'));
  });
  test('sample keeps at most n per (format, shape), deterministically', () => {
    const reqs = Array.from({ length: 50 }, (_, i) => ({ format: 'html', path: `/gen.1.${i + 1}` }));
    expect(sample(reqs, 3)).toHaveLength(3);
    expect(sample(reqs, 3)).toEqual(sample(reqs, 3));
  });
});
```

**Step 2: Implement** `traffic.mjs`:
- `parseLine`: NPM log_format is `[$time_local] $upstream_cache_status $upstream_status $status - $request_method $scheme $host "$request_uri" …`; regex `^\[[^\]]+\] .*? (\d{3}) - ([A-Z]+) \S+ (\S+) "([^"]*)"` takes the client `$status` (so `HIT - 200` is kept, `BYPASS 502, 200 200` parses, `BYPASS 200 499` is dropped); keep GET with status 200; drop paths matching `^/(js|css|img|fonts?)/|\.(js|css|png|jpe?g|gif|svg|ico|woff2?|ttf|eot)$`.
- `format` from host via `formatForSubdomain` (`src/domain/rules/requestParsing.js`).
- `shapeOf(path)`: replace version prefixes `/[a-z0-9*.]+/` with `/V/`, digits runs with `9`, letters runs with `a`, so `/kjv/john.3.16` → `/V/a.9.9`.
- `sample(reqs, n)`: group by `format + shapeOf(path)`, sort each group by path, take the first n.
- CLI: `node test/parity/traffic.mjs <access.log> [more…] > test/parity/.cache/traffic.json` (gunzip `.gz` inputs).

**Step 3:** vitest → PASS.

**Step 4: Run.** The logs are on the production host; copy the scripture.guide proxy access logs (current and rotated) to `/tmp/sg-logs/` as described in the private infrastructure runbook, then
`node test/parity/traffic.mjs /tmp/sg-logs/* > test/parity/.cache/traffic.json` (stays gitignored: paths include users' search terms) and
`node test/parity/run.mjs --corpus traffic` (it fetches live once per URL, throttled at 250 ms).

**Step 5:** Fix failures, or allow-list with reasons. Commit code only: `test(web): traffic-derived parity corpus`.

### Task 5: Browser smoke tests

**Files:**
- Create: `apps/web/test/browser/smoke.mjs`, `apps/web/test/browser/pages.mjs`
- Modify: `apps/web/package.json` (devDependencies `playwright`, `pixelmatch`, `pngjs`; script `"browser": "node test/browser/smoke.mjs"`)

**Step 1:** `npm i -D playwright pixelmatch pngjs -w @scripture-guide/web && npx playwright install chromium`.

**Step 2:** `pages.mjs` exports ~10 paths covering: plain verse, chapter with headings (`/niv/matt.5`), poetry (`/ps.23`), Book of Mormon (`/1ne.3.7`), facsimile-capable (`/1830/1ne.1.1`), search (`/faith`), parallel (`/isa.2~2ne.12`), home (`/`), Korean (`/krbom/1ne.1.1`).

**Step 3:** `smoke.mjs` for each path:
1. Screenshot `https://scripture.guide<path>` and `http://127.0.0.1:3101<path>` at 1280×900, `waitUntil: 'networkidle'`, with fonts loaded (`document.fonts.ready`).
2. `pixelmatch` with threshold 0.1; fail when > 0.5% of pixels differ; write `test/browser/.out/<name>.{live,node,diff}.png` (gitignored).
3. Interactions on the Node page, each asserted:
   - Clicking the first `.verse` opens the version box (`.versebox` visible) with a "Versions" tab.
   - The Copy button exists and copies non-empty text (`navigator.clipboard.readText` with clipboard permission granted).
   - The version selector shows `img.option` covers loaded (`naturalWidth > 0`).
4. Collect `console` errors and failed requests (`requestfailed`, HTTP ≥ 400) on the Node page; any is a failure.

**Step 4: Run** `npm run browser`; fix until green. Commit `test(web): browser smoke suite against live`.

### Task 6: Sphinx versus fallback in CI

**Files:**
- Create: `apps/web/test/integration/sphinx-vs-fallback.mjs`
- Modify: `.github/workflows/stack.yml`

**Step 1:** The script runs `SearchService` twice for each query in `['loved', 'faith hope charity', 'in the beginning', 'water', 'lord god']` against the seeded stack: once with `SPHINX_HOST=127.0.0.1 SPHINX_PORT=9306`, once with `SPHINX_HOST` unset (MySQL fallback on `127.0.0.1:3307`). It compares the sets of `verse_id+version` per version (KJV, ASV, WEB) and exits non-zero on any difference, printing up to 10 differing ids.

**Step 2:** Add a step to `stack.yml` after "Sphinx finds seeded verses":

```yaml
      - name: Sphinx and MySQL fallback agree
        working-directory: apps/web
        env: { MYSQL_HOST: 127.0.0.1, MYSQL_PORT: '3307', MYSQL_USER: sg, MYSQL_PASSWORD: dev, MYSQL_DATABASE: scripture_guide }
        run: npm ci --prefix ../.. && npm run build -w scripture-guide --prefix ../.. && node test/integration/sphinx-vs-fallback.mjs
```

**Step 3:** Push; the `stack` workflow must pass. Differences found are real search bugs: fix in `src/services/search/` with a unit test each.

**Step 4: Commit** `test(web): Sphinx and fallback search agree on the seeds`.

### Task 7: Structured request logs

**Files:**
- Create: `apps/web/src/app/middleware/requestLog.js`
- Modify: `apps/web/src/app.js` (replace `morgan(...)`)
- Test: `apps/web/test/unit/requestLog.test.js`

**Step 1: Failing test** (supertest app with the middleware writing to an array):

```js
test('one JSON line per request with the fields log queries need', async () => {
  const lines = [];
  const app = express();
  app.use(requestLog({ write: l => lines.push(l) }));
  app.get('/x', (req, res) => { req.config = { outputFormat: 'api' }; res.status(201).send('ok'); });
  await request(app).get('/x?q=1').set('Host', 'api.scripture.guide').set('User-Agent', 'ua');
  const rec = JSON.parse(lines[0]);
  expect(rec).toMatchObject({ msg: 'request', method: 'GET', path: '/x?q=1', host: 'api.scripture.guide', status: 201, format: 'api', ua: 'ua' });
  expect(typeof rec.duration_ms).toBe('number');
  expect(rec.time).toMatch(/^\d{4}-\d\d-\d\dT/);
});
```

**Step 2: Implement** with `on-finished` semantics (`res.on('finish')`), fields `time, msg, method, host, path, status, bytes (Content-Length), duration_ms, format (req.config?.outputFormat), ua, referer, ip (req.ip)`; default writer `process.stdout.write(line + '\n')`; skip `/health` and `/healthz`. Errors from `error.js` log `{msg:'error', path, error: err.message, stack}` as one JSON line.

**Step 3:** vitest → PASS; boot the app and check one line appears per request.

**Step 4: Commit** `feat(web): JSON request logs`.

### Task 8: Staging run

Owner-gated (see the private infrastructure runbook for `next.scripture.guide`). After deployment:
1. `NODE_BASE=<tunnel> node test/parity/run.mjs --refresh` → 0 fail.
2. `node test/parity/run.mjs --corpus traffic` against the tunnel → 0 fail.
3. Browser suite with `NODE_ORIGIN=https://next.scripture.guide` → green.
4. `curl https://next.scripture.guide/healthz` → `sphinx: ok`.

Then Phase 6 cutover can be scheduled.
