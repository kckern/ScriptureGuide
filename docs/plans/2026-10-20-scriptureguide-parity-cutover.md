# ScriptureGuide Parity and Cutover Plan (Phases 5–7)

> **For Claude:** Phase 5 runs as parallel work streams, one agent per stream in its own git worktree. Each stream owns the files listed for it, follows TDD, and finishes when its formats pass the parity harness.

**Goal:** The Node app (`apps/web`) serves every live scripture.guide format with output equivalent to the PHP site, measured by `apps/web/test/parity`, so the site can switch over.

**Architecture:** Express app with the existing lookup service and presenters. Each output format is one module, `src/presentation/presenters/formats/<format>.js`, loaded by `src/app/middleware/output.js`; formats without a module render HTML. The subdomain (`<format>.scripture.guide`) or a path prefix (`/<format>/...`) selects the format.

**Design:** `docs/plans/2026-10-20-scriptureguide-unification-design.md`

## What the live site actually serves (surveyed 2026-10-20)

| Format | Live state | Phase 5 target |
|---|---|---|
| html (page, chapter nav, OG tags) | Works | Parity |
| api, meta, raw, plain | Work | Parity (JSON compared structurally, text exactly) |
| latex | Works (Korean study-edition specific) | Parity |
| notes | Works, mostly empty output | Parity |
| search | Works (Sphinx) | Parity of page; Sphinx client with REGEXP fallback |
| parallel (`a~b`) | Works | Parity |
| passage, versionselect, vbox, settings (AJAX) | Work | Parity; GET and POST |
| save_prefs | Works, unauthenticated, SQL built by interpolation | Keep the existing no-op stub until there is a login model |
| markdown, xml | PHP fatal error | New output defined from the PHP code's intent |
| cover | Empty file | 302 to `media.scripture.guide/covers/<img>.jpg` |
| hub | Empty file | 410 |
| slide | Empty (2020 Korean one-off) | 410 |
| audio, img, imgc, fax | Served from CloudFront/S3, or broken | Deferred: needs the asset store location |

## Work streams

Port numbers keep each stream's local server separate. All streams use the shared full database copy and the shared live cache:
`MYSQL_HOST=127.0.0.1 MYSQL_PORT=3310 MYSQL_USER=root MYSQL_PASSWORD=dev MYSQL_DATABASE=sgfull`, `PARITY_CACHE=<main checkout>/apps/web/test/parity/.cache`.

| Stream | Owns | Formats | Port |
|---|---|---|---|
| A. Request parsing and HTML | `src/app/middleware/config.js`, `subdomain.js`, `ScriptureLookupService`, `HtmlPresenter`, repositories it needs, views | URL rules from the PHP front controller (version paths `a.b*c`, flags from query and host labels, `=/`, `random`, default version by verse range, JST rule), html page parity | 3111 |
| B. Data formats | `formats/api.js`, `meta.js`, `raw.js`, `plain.js`, new repository files | api, meta, raw, plain | 3112 |
| C. Document formats | `formats/latex.js`, `markdown.js`, `xml.js`, `notes.js`, `cover.js` | latex, notes, markdown, xml, cover, hub/slide 410 | 3113 |
| D. Parallel and search | parallel and search controller/views, Sphinx client | parallel, search | 3114 |
| E. AJAX and legacy routes | AJAX routes, legacy `.php` redirects, `/healthz` | passage, versionselect, vbox, settings | 3115 |

Each stream:

1. Writes unit tests first (vitest, `apps/web/test/unit/`), using fixtures built from public-domain text only (KJV/ASV/WEB) or hand-written strings. No licensed text in the repository.
2. Implements until its unit tests pass.
3. Runs `npm run parity -- --format <its formats>` against its own server and fixes differences until they pass. Differences that are deliberate (fixing a PHP bug) go in `test/parity/allow.json` with a reason.
4. Commits on its branch with clear messages.

Integration merges the streams in order A, B, C, D, E and reruns the full harness.

## Phase 6: cutover (after Phase 5)

1. Deploy the image to bom as `next.scripture.guide` (and `*.next`) with a read-only database user.
2. Run the harness against staging (`NODE_BASE=https://next.scripture.guide`).
3. Switch `scripture.guide` and `*.scripture.guide` in the proxy; PHP stays up, unrouted, for rollback.
4. After 30 days without rollback: archive `kckern/scripture-guide-legacy` and the PHP vhost.

## Phase 7: editorial CLI

Port the PHP editorial tools (`workspace/`, `conc/`, `headings/` in the legacy snapshot) to `scripts/editorial/` as CLI commands with dry-run modes, after confirming which tools are still used.
