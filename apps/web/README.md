# Scripture Guide web app

Node/Express port of scripture.guide. Start it with `npm start`; settings come from the
environment (`src/config/index.js`). Tests: `npm test`; comparison with the live site:
`test/parity/README.md`.

## Operations

### Per-process caches: restart after editing the database

Some lookups are read once per process and kept until it exits. They have no expiry, so after
an editorial change to these tables, restart the app:

| Cached | Source | Code |
|---|---|---|
| Version names for templates | `scripture_versions` (id, title) | `src/app.js` |
| Books of the verse index | `lds_scriptures_books` | `VerseRepository.findAllBooks` |
| Versions that have headings, and versions that have text | `scripture_headings`, `scripture_verses` (`DISTINCT version`) | `HeadingRepository.knownVersions` |
| Where each version's sections start (heading verse ids and book ids) | `scripture_headings` (footer = 0) | `HeadingRepository.headingStarts` |
| A version's last verse, `MAX(verse_id)` | `scripture_verses` | `HeadingRepository.findVersionLastVerseId` |
| Search fallback only: FULLTEXT settings and `MAX(id)` | `information_schema`, `scripture_verses` | `SearchRepository` |

Version ids arrive in URLs, so the per-version caches hold only versions that exist: the
versions present in `scripture_headings` and `scripture_verses` are read once, and any other
version gets an empty answer without a cache entry or a query.

Verse text, heading text and everything else is read on every request. A failed lookup is not
cached; it is retried on the next request (a database error is reported, not read as "no data").

### Text font (private)

The licensed text font is not in the repository or the image. Set `FONT_DIR` to a directory
holding `scripture.woff2` (served at `/private-fonts`), or `FONT_BASE` to where it is hosted;
`FONT_GOUDY_FILE` renames the file (use a new name when replacing the font: it is cached 30
days). Unset, or `FONT_DIR` without the file (a warning at start-up), pages use Sorts Mill
Goudy. See
[docs/fonts.md](docs/fonts.md#served-privately), which also has the bom mount.

### Search

With `SPHINX_HOST` set, search goes to Sphinx (SphinxQL on `SPHINX_PORT`, default 9306), with the
PHP site's limits (99,999 hits, 5,000 per volume when a query is too broad). Without it, search
falls back to MySQL (meant for development), which stops a search after
`SEARCH_FALLBACK_MAX_MS` (default 1500) or after reading about `SEARCH_FALLBACK_MAX_ROWS` rows
(default 1,000,000; the verse table has about 1.6 million) and shows what it found with
"Showing partial results — narrow your search". The budget is checked between queries, so one
query can run past it (a LIKE-only scan over all versions reads 100,000 ids per query, about
150 ms; other queries are bounded by their FULLTEXT match or by the LDS/KJV rows of a verse
range). Rows read are counted as the id span of such a scan, otherwise as the rows returned.

## Browser smoke suite

`test/browser/smoke.mjs` loads the pages in `test/browser/pages.mjs` in Chromium on the live site
and on a Node app, compares screenshots and drives the reader (version box, copy, version
selector) on the Node page. It is a manual check before a deploy or on staging, not part of CI:
it needs the live site and a Node app running against a full copy of the database (setup in
`test/parity/README.md`).

```sh
npx playwright install chromium     # once
npm run browser -w @scripture-guide/web -- [--only <name|path>] [--reuse-live] [--font-mode native]
```

A page fails when more than `PIXEL_THRESHOLD` of its pixels differ (default 0.001), when one
region of differing pixels holds more than `REGION_MAX_PIXELS` (default 100), or on a console
error, failed request or interaction on the Node page. Screenshots, diffs and `report.json` go
to `test/browser/.out/` (gitignored).

| Variable | Default | |
|---|---|---|
| `NODE_BASE` | `http://127.0.0.1:3101` | Node app under test |
| `LIVE_BASE` | `https://scripture.guide` | reference site |
| `FONT_CHECK_BASE` | unset | a second Node app started with `FONT_DIR`/`FONT_BASE`: fails unless the private font is declared, fetched and used there |
| `FONT_MODE` | `normalize` | `normalize` sets the text of both pages in one font, so the diff measures layout; `native` compares the real fonts |
| `PIXEL_THRESHOLD`, `REGION_MAX_PIXELS`, `REGION_GAP` | 0.001, 100, 2 | the comparison gates |
| `LIVE_MAX_AGE_DAYS` | 7 | oldest live screenshot `--reuse-live` accepts |

Each page loads once on live per run, one after another. `--reuse-live` uses the live screenshot
saved by an earlier run instead, when its sidecar (`<name>.live.json`: capture time, font mode,
masks, viewport) matches this run and is recent enough; otherwise that page loads live again.
Prefer it while iterating on the Node side.
