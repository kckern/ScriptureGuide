# ScriptureGuide Unification Design

Date: 2026-10-20
Status: Approved (brainstorming session)

## Goal

Bring every Scripture Guide asset into one public, open-source repo, `kckern/ScriptureGuide`, and replace the live PHP site with the Node app at full parity. Only licensed scripture text stays private.

## Current state

| Asset | Location | State |
|---|---|---|
| npm package `scripture-guide` | `kckern/ScriptureGuideUtils` (8 stars) | Published (npm latest 1.0.97). Local master 13 commits ahead of GitHub; 1.0.98 unpublished |
| Chrome extension | `kckern/ScriptureGuideChromeExtention` | v2.0.1 in repo; Web Store version unconfirmed. Depends on `scripture-guide@^1.0.93` |
| PHP app (live) | Production host `bom` | Serves scripture.guide via `php` container. Not in git. Copy in `PHPBox` may have drifted |
| Node port (WIP) | `PHPBox/www/scripture.guide/scripture-guide-js` | Express/EJS, ~3.2k lines, 18 commits (2026-03-17). Not deployed |
| Database | MySQL 8 on `bom`, schema `scripture.guide` (27 tables, ~911 MB) | Private (licensed text) |
| Search | Sphinx container on `bom`; `kckern/ScriptureGuideSearch` (ECS) | Two deployments of the same index |
| `kckern/ScriptureGuideApp` | GitHub | Empty placeholder |

Other consumer: bookofmormon.online (`~/greenfield` on `bom`) installs `scripture-guide` from npm and is unaffected.

## Decisions

- **One repo.** Rename `ScriptureGuideUtils` to `ScriptureGuide` to keep stars, forks, issues, and GitHub redirects.
- **Public/private boundary.** All code, the schema, and public-domain seed data are public. Licensed text lives only in the private database.
- **Full parity before cutover**, with better handling where PHP is wrong. Every output format is addressable as `<format>.scripture.guide/<content_query>`.
- **Editorial tools** (`conc/`, `headings/`, `workspace/`) become CLI scripts, not web UIs.
- **Hosting** stays on `bom` in Docker behind nginx-proxy-manager.
- **Public Docker image**, published automatically by GitHub Actions.
- **Chrome extension:** verify Web Store version, rebuild on the current package, republish.

## 1. Repo layout and history

```
ScriptureGuide/
├── packages/scripture-guide/   npm package
├── apps/web/                   Node app
├── apps/chrome-extension/      MV3 extension
├── data/seeds/                 public-domain texts, schema DDL, loader
├── scripts/editorial/          CLI replacements for PHP editorial tools
├── infra/                      Dockerfiles, compose, sphinx.conf, deploy scripts
└── package.json                npm workspaces root
```

Steps:

1. Prerequisites: push local master (13 commits) to GitHub; resolve the two Dependabot branches; decide the fate of `feature/yaml-refactor` (11 unpushed commits from January, 2 uncommitted files in `.worktrees/yaml-refactor`).
2. Rename the GitHub repo to `ScriptureGuide`.
3. Move current contents into `packages/scripture-guide/` in one `git mv` commit.
4. `git subtree add --prefix=apps/chrome-extension` from the extension repo (full history).
5. `git filter-repo --subdirectory-filter www/scripture.guide/scripture-guide-js` on a PHPBox clone, then `git subtree add --prefix=apps/web`.
6. Snapshot the live PHP from `bom` (not PHPBox) into the private repo `kckern/scripture-guide-legacy` (reference only; it is not published because it includes editorial tools and private-schema details).
7. Archive `ScriptureGuideChromeExtention`, `ScriptureGuideSearch`, `ScriptureGuideApp`, each with a README pointing to the new repo. Remove the AWS account ID from the archived `buildspec.yml`.

Cleanups during the move: fix `npm test` (points at a missing `test/test.mjs`); move `mysql2` and `dotenv` to devDependencies; set the package `repository` to the new URL with `"directory": "packages/scripture-guide"`; publish 1.0.98.

Local folders:

- Rename `~/Documents/GitHub/ScriptureGuideUtils` to `~/Documents/GitHub/ScriptureGuide` after the GitHub rename, then `git remote set-url` and `git worktree repair`.
- Delete the local `ScriptureGuideChromeExtention` clone after verifying the subtree import (it is in sync with origin).
- `PHPBox` stays (hosts other sites); remove only `www/scripture.guide/` after cutover.

## 2. Release pipeline

Changesets drives versioning. Merging the "Version packages" PR on master runs `release.yml`, which publishes each bumped workspace:

| Workspace | Target | Mechanism |
|---|---|---|
| `packages/scripture-guide` | npm | `npm publish --provenance` |
| `apps/web` | `ghcr.io/kckern/scripture-guide` (public, amd64 + arm64) | Tags `:<version>`, `:latest`, `:sha-<short>`; cosign-signed |
| `apps/chrome-extension` | Chrome Web Store | `chrome-webstore-upload`, submitted for review |

Every push to master also publishes `:edge` for staging. A published version tag triggers deploy to `bom` over SSH using the existing blue-green script with cosign verification.

`ghcr.io/kckern/scripture-guide-seed` is a public MySQL image with the public-domain seeds preloaded, so `docker compose up` runs the full stack.

Secrets: `NPM_TOKEN` (or npm trusted publishing), Chrome Web Store OAuth client ID/secret/refresh token, and a deploy SSH key restricted to the deploy script. Neither image contains credentials or licensed data.

Per-workspace CI uses path filters. The package keeps its critical-test merge gate and edge-test release gate.

## 3. Web app architecture

- **Query resolver.** Parses `<content_query>` with `scripture-guide`, loads verses, headings, parallels, and footnotes through repositories, and returns one format-independent `Passage`.
- **Renderer registry.** The subdomain picks a renderer: `html` (bare domain), `api`/`json`, `raw`, `plain`, `markdown`, `xml`, `latex`, `meta`, `notes`, `audio`, `slide`, `img`, `cover`, `fax`, `hub`, `parallel`. Renderers are pure functions of `(Passage, options)`.
- **Compatibility.** `?format=` and path forms also work (local dev without wildcard DNS). Legacy `.php` paths and `.htaccess` routes get 301s or rewrites. The `api` JSON shape is preserved exactly.
- **Media.** Audio (ffmpeg) and image outputs are cached on a volume keyed by query, version, and format, with a size cap and LRU eviction.
- **Search.** Sphinx via SphinxQL, unchanged. Meilisearch is out of scope.
- **Slugs.** `toSlug`/`fromSlug` move into `scripture-guide`; the extension's `src/shared/slug.js` is deleted.
- **Config.** `DATABASE_URL`, `SPHINX_URL`, `CACHE_DIR`, `BASE_DOMAIN`, rendered from Infisical as greenfield does.

## 4. Data and seeds

- `data/seeds/schema.sql`: DDL for the tables the app reads, dumped with `--no-data` and reviewed by hand. Excludes `tmp_*`, `users`, `social_queue`.
- `data/seeds/<version>/`: compressed TSV or SQL per public-domain version (KJV first), each with a `SOURCE.md` naming origin and license.
- `npm run seed` loads seeds into any MySQL. CI and local dev use only seeds.
- A CI check rejects seeds for any version not on the public-domain allow-list.
- `scripts/editorial/`: `export-seed`, `import-headings`, `import-footnotes`, `audit`, `reindex-search`. Each runs against `DATABASE_URL`, has a dry-run mode, and never runs inside the web container. Port by reading what each PHP tool did; drop unused ones.
- `bom_prd.lds_scriptures_*` (used by bookofmormon.online) is out of scope.

## 5. Security and operations

Host hardening for `bom` (database exposure, admin access, credentials) is tracked in the private infrastructure repo, not here. The web app connects with a read-only database user; credentials come from the environment at runtime and are never in images or this repo. gitleaks runs in CI.

Operations: exclude the container from Watchtower (deploys come from tagged releases); `/healthz` checks DB and Sphinx and backs the Docker healthcheck; the existing Prometheus/cAdvisor/VictoriaLogs stack covers the container.

## 6. Parity and cutover

**Parity harness** (`apps/web/test/parity/`):

- Corpus of real URLs from nginx-proxy-manager access logs for `*.scripture.guide`, stratified by format and query shape, plus hand-picked edge cases (the March heading and parallel bugs). URLs only are committed.
- Fetch each URL from `PHP_BASE` and `NODE_BASE`. Normalize and diff HTML/XML; compare JSON structurally; compare binary outputs by metadata.
- Per-format pass/fail report. An allow-list records intentional differences with reasons.

**Cutover:**

1. Security fixes (section 5).
2. Deploy `:edge` as `next.scripture.guide` with `*.next.` subdomains.
3. Port formats until the harness is green: html, api, parallel, text exports, media.
4. Optional: mirror sampled production traffic to Node for a week and log diffs.
5. Switch `scripture.guide` and `*.scripture.guide` to the Node container in nginx-proxy-manager. PHP stays up but unrouted.
6. Rollback is one proxy change.
7. After 30 days without rollback: archive `kckern/scripture-guide-legacy`, delete the PHPBox scripture.guide directory, and its vhost. Shut down the ECS search service after confirming it gets no traffic.

## 7. Testing

- **Package:** existing Jest suite and gates, plus `toSlug`/`fromSlug` round-trips over all fixture references.
- **Web:** renderer golden files; supertest integration against a MySQL service container loaded from seeds, covering every format route and legacy redirect; parity harness run against staging (needs private data, so not a CI gate).
- **Extension:** existing Jest/jsdom suite, now on the workspace package.
- **Editorial scripts:** dry-run mode; seed-backed tests where possible.
- **Repo-wide:** gitleaks; seed allow-list check.

## Phases

| # | Phase | Done when |
|---|---|---|
| 0 | Host security | Tracked privately |
| 1 | Monorepo | Prerequisites done; repo renamed; package, extension, web, PHP snapshot imported with history; CI green |
| 2 | Release pipeline | Changesets publishing to npm, GHCR, Web Store; `:edge` builds on push; 1.0.98 published through it |
| 3 | Extension republish | Store version confirmed; v2.0.2 shipped on current package |
| 4 | Seeds and schema | KJV seed and seed image; `docker compose up` runs locally |
| 5 | Web parity | All formats ported; harness green on staging |
| 6 | Cutover | Proxy switched; 30 days stable; PHP and old repos retired |
| 7 | Editorial CLI | PHP tools replaced by scripts (parallel with 5–6) |

Phase 5 is the bulk of the work.

## Out of scope

- Meilisearch migration.
- Merging `bom_prd` and `scripture.guide` schemas.
- Changes to bookofmormon.online beyond normal npm upgrades.
