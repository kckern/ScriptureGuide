# ScriptureGuide Foundation Implementation Plan (Phases 0–4)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate all Scripture Guide code into the public `kckern/ScriptureGuide` monorepo with history, automate publishing to npm, GHCR, and the Chrome Web Store, republish the extension, and produce public-domain seed data so the whole stack runs locally with `docker compose up`.

**Architecture:** npm workspaces monorepo (`packages/scripture-guide`, `apps/web`, `apps/chrome-extension`). Changesets versions everything; one `release.yml` publishes whatever was bumped. Licensed text stays in the private MySQL on host `bom`; the repo carries only schema DDL and public-domain seeds as gzipped SQL.

**Tech Stack:** Node 20, npm 11 workspaces, Jest (package, extension), Vitest (web), Changesets, GitHub Actions, Docker Buildx, cosign (keyless), GHCR, chrome-webstore-upload-cli, MySQL 8, Sphinx (macbre/sphinxsearch).

**Design:** `docs/plans/2026-10-20-scriptureguide-unification-design.md`

**Conventions for the executor:**
- Repo root is `$REPO` (today `/Users/kckern/Documents/GitHub/ScriptureGuideUtils`).
- Anything that changes host `bom` or GitHub settings needs KC's explicit go-ahead at the time it runs. Ask before Tasks 1.3, 1.8, 1.10, 2.6, 3.3.
- Never print secrets. When a command would show a credential, grep for key names only.
- Commit messages end with the `Co-Authored-By` line from the session's attribution instructions.

---

## Phase 0: Host security

Tracked privately (host hardening for `bom`). Phase 1 onward does not depend on it, except that Task 4.1 needs the read-only `sg_reader` database user.

---

## Phase 1: Monorepo

### Task 1.1: Settle stray branches

Decided 2026-10-20. Already done: tag `archive/yaml-refactor` pushed, issue #4 (canon auto-detect) opened, Dependabot PRs #2 and #3 closed.

**Step 1: Remove the parked worktree and branch** (KC runs this; the session's safety rules block force-deletes):

```bash
git worktree remove --force .worktrees/yaml-refactor   # only a deleted .DS_Store and a test report are uncommitted
git branch -D feature/yaml-refactor                     # preserved by tag archive/yaml-refactor
git worktree list                                       # only the main checkout remains
```

**Step 2: Merge the design docs branch**

```bash
git switch master && git merge --ff-only docs/unification-design && git push origin master && git branch -d docs/unification-design
```

### Task 1.2: Package hygiene before the move

**Files:**
- Modify: `package.json`

**Step 1: Confirm `src/` does not use `mysql2` or `dotenv`**

```bash
grep -rnE "mysql2|dotenv" src/ build/ ; echo "exit=$?"
```

Expected: no matches (`exit=1`). They are only used by `scripts/extract-*.mjs`.

**Step 2: Record what 1.0.97 ships**

```bash
mkdir -p /tmp/sg-pack && cd /tmp/sg-pack && npm pack scripture-guide@1.0.97 >/dev/null && tar tzf scripture-guide-1.0.97.tgz | sort > published.txt && cat published.txt; cd -
```

**Step 3: Edit `package.json`**
- `"scripts"`: delete `"start"`; set `"test": "npm run test:jest"`.
- Move `dotenv` and `mysql2` from `dependencies` to `devDependencies`; delete the empty `dependencies` key.
- `"files"`: `["dist/scriptures.mjs", "dist/scriptures.cjs", "dist/scriptures.d.ts"]`.
- `"repository"`: `{ "type": "git", "url": "git+https://github.com/kckern/ScriptureGuide.git", "directory": "packages/scripture-guide" }` (the URL must match the repo exactly for npm provenance; it becomes valid after Task 1.3).
- `"bugs"`: `{ "url": "https://github.com/kckern/ScriptureGuide/issues" }`.

**Step 4: Verify**

```bash
npm install && npm run build && npm test 2>&1 | tail -5
npm pack --dry-run --json | jq -r '.[0].files[].path' | sort
```

Expected: tests pass with the same counts as before (`git stash; npm run test:jest | tail -5; git stash pop` to compare). The pack list matches `published.txt` (package.json, README.md, the three dist files).

**Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(pkg): fix npm test, move script-only deps to dev, point repository at ScriptureGuide"
```

### Task 1.3: Rename the GitHub repo (KC go-ahead required)

```bash
gh repo rename ScriptureGuide -R kckern/ScriptureGuideUtils --yes
git remote set-url origin https://github.com/kckern/ScriptureGuide.git
git fetch origin && git status -sb | head -1
gh repo view kckern/ScriptureGuide --json stargazerCount,name
git ls-remote https://github.com/kckern/ScriptureGuideUtils.git HEAD   # redirect works
```

Expected: `ScriptureGuide`, 8+ stars, redirect resolves. Update the description: `gh repo edit kckern/ScriptureGuide --description "Scripture reference parser, scripture.guide web app, and browser extension" --homepage https://scripture.guide`.

### Task 1.4: Move the package into `packages/scripture-guide`

**Files:**
- Move: `build/ data/ dist/ scripts/ src/ test/ jest.config.js README.md .npmignore package.json` → `packages/scripture-guide/`
- Create: `packages/scripture-guide/.gitignore`, root `package.json`, root `README.md`
- Modify: root `.gitignore`
- Delete: root `package-lock.json` (regenerated)

`docs/` and `.github/` stay at the root.

**Step 1: Move tracked files**

```bash
git status --porcelain   # must be empty
mkdir -p packages/scripture-guide
git mv build data dist scripts src test jest.config.js README.md .npmignore package.json packages/scripture-guide/
git rm -q package-lock.json
git rm -q --cached .DS_Store 2>/dev/null; true
git ls-files | cut -d/ -f1 | sort -u
```

Expected roots: `.github .gitignore docs packages`.

**Step 2: Move ignored local files that the package uses**

```bash
[ -f .env ] && mv .env packages/scripture-guide/.env     # extract-* scripts load dotenv from cwd
rm -rf src dist node_modules test-results.md             # leftovers of ignored build output, if any
```

**Step 3: Package `.gitignore`** — create `packages/scripture-guide/.gitignore`:

```gitignore
src/data/
dist/*.cjs
dist/*.mjs
dist/*.map
coverage/
test_results/
test-results.md
_archive/
```

**Step 4: Root `.gitignore`** — replace contents with:

```gitignore
node_modules/
.env
.DS_Store
.claude/
.venv/
.worktrees/
dist/
!packages/scripture-guide/dist/
*.zip
```

(`packages/scripture-guide/dist/scriptures.d.ts` is tracked; its generated siblings are ignored by the package `.gitignore`.)

**Step 5: Root `package.json`**

```json
{
  "name": "scriptureguide",
  "private": true,
  "workspaces": ["packages/*", "apps/*"],
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "npm run build -w scripture-guide && npm test --workspaces --if-present"
  }
}
```

**Step 6: Root `README.md`**

```markdown
# Scripture Guide

Source for [scripture.guide](https://scripture.guide).

| Path | What | Published to |
|---|---|---|
| `packages/scripture-guide` | Scripture reference parser | [npm](https://www.npmjs.com/package/scripture-guide) |
| `apps/web` | scripture.guide web app | `ghcr.io/kckern/scripture-guide` |
| `apps/chrome-extension` | Browser extension | Chrome Web Store |
| `data/seeds` | Public-domain texts and schema | `ghcr.io/kckern/scripture-guide-seed` |

Licensed translations are not in this repository.
```

**Step 7: Install and test**

```bash
npm install
npm run build -w scripture-guide && npm test -w scripture-guide 2>&1 | tail -5
```

Expected: same pass counts as Task 1.2 Step 4.

**Step 8: Verify history follows**

```bash
git add -A && git commit -m "refactor: move scripture-guide package into packages/ for monorepo"
git log --follow --oneline -3 -- packages/scripture-guide/src/scriptures.mjs
```

Expected: shows commits from before the move.

### Task 1.5: CI for the package under the new layout

**Files:**
- Rename: `.github/workflows/test.yml` → `.github/workflows/package.yml`

**Step 1:** `git mv .github/workflows/test.yml .github/workflows/package.yml`, then edit:
- `name: scripture-guide package`
- Under both `pull_request` and `push`, add `paths: ['packages/scripture-guide/**', 'package-lock.json', '.github/workflows/package.yml']`.
- In every job replace `npm run build` with `npm run build -w scripture-guide`, and `npm run test:<x> -- --ci` with `npm run test:<x> -w scripture-guide -- --ci`.

**Step 2: Commit and push, watch the run**

```bash
git add -A && git commit -m "ci: run package tests from workspace with path filter"
git push origin master && gh run watch -R kckern/ScriptureGuide $(gh run list -R kckern/ScriptureGuide -L1 --json databaseId -q '.[0].databaseId')
```

Expected: Critical and Edge jobs green.

### Task 1.6: Import the Chrome extension with history

**Files:**
- Create (via subtree): `apps/chrome-extension/**`
- Modify: `apps/chrome-extension/package.json`
- Delete: `apps/chrome-extension/package-lock.json`

**Step 1: Subtree add**

```bash
git subtree add --prefix=apps/chrome-extension https://github.com/kckern/ScriptureGuideChromeExtention.git master
git log --oneline -3 -- apps/chrome-extension/src/content/index.js
```

Expected: the extension's own commits appear.

**Step 2: Adapt `apps/chrome-extension/package.json`**
- Add `"private": true`.
- `"dependencies": { "scripture-guide": "^1.0.98" }` (satisfied by the workspace, so npm links it).

```bash
git rm -q apps/chrome-extension/package-lock.json
npm install
ls -l node_modules/scripture-guide   # symlink to ../packages/scripture-guide
```

**Step 3: Run extension tests against the workspace package**

```bash
npm run build -w scripture-guide && npm test -w scripture-guide-chrome-extension 2>&1 | tail -8
```

Expected: all 9 suites pass. If detection tests now fail because 1.0.94–1.0.98 changed detection behavior, inspect each failure: if the new package behavior is correct (prose false positives removed), update the extension test expectation; otherwise file it against the package. Note each change in the commit message.

**Step 4: Build**

```bash
npm run build -w scripture-guide-chrome-extension && ls apps/chrome-extension/dist
```

Expected: `manifest.json content.js background.js popup.html options.html ...`

**Step 5: Commit**

```bash
git add -A && git commit -m "build(extension): use workspace scripture-guide; drop nested lockfile"
```

### Task 1.7: Import the Node web app with history

**Files:**
- Create (via subtree): `apps/web/**`
- Modify: `apps/web/package.json`

**Step 1: Filter PHPBox down to the Node app**

```bash
WORK=$(mktemp -d)
git clone --no-local ~/Documents/GitHub/PHPBox "$WORK/phpbox"
cd "$WORK/phpbox" && git filter-repo --subdirectory-filter www/scripture.guide/scripture-guide-js --force
BR=$(git branch --show-current); git log --oneline | wc -l; ls
cd -
```

Expected: about 18 commits; `package.json src docker public tests WORKPLAN.md .env.example` at top.

**Step 2: Subtree add**

```bash
git subtree add --prefix=apps/web "$WORK/phpbox" "$BR"
```

**Step 3: Fix the name collision.** The app's `package.json` is also named `scripture-guide`, which breaks workspaces. Edit `apps/web/package.json`:
- `"name": "@scripture-guide/web"`, `"private": true`
- `"dependencies"."scripture-guide": "^1.0.98"`
- `"scripts"."test": "vitest run --passWithNoTests"` (real tests come in Plan 2)
- Delete the `docker:*` scripts (the Dockerfile moves in Task 2.3).

```bash
git rm -q apps/web/package-lock.json
npm install
node -e "import('scripture-guide').then(m=>console.log(typeof m.lookupReference))" --input-type=module   # run from apps/web
```

Expected: `function`.

**Step 4: Upgrade `mysql2`.** The `^3.6.5` range admits versions with an open high-severity advisory (auth plugin downgrade to `mysql_clear_password`, leaking plaintext credentials). Before this app ever holds production credentials:

```bash
npm install mysql2@latest -w @scripture-guide/web
npm audit --workspaces --omit=dev
```

Expected: no high or critical advisories for runtime dependencies. Then run `npm audit fix` at the root for the dev-tool advisories (js-yaml, brace-expansion, browserslist), re-run all workspace tests, and commit the lockfile with the upgrade.

**Step 5: Mark `WORKPLAN.md` stale.** Prepend one line: `> Superseded by docs/plans/2026-10-20-scriptureguide-unification-design.md; kept for history.`

**Step 6: Commit**

```bash
git add -A && git commit -m "build(web): import Node app from PHPBox; rename to @scripture-guide/web"
```

### Task 1.8: Snapshot the live PHP (DONE 2026-10-20, private)

The live PHP is in the private repo `kckern/scripture-guide-legacy` (141 files; fonts and slide images over 1 MB left out; one dead Jenkins token redacted; provenance in its README). It is not in this public repo: it contains editorial tools and private-schema details, and the parity harness compares the live sites over HTTP, so this repo never needs the PHP source. Read it from a local clone at `~/Documents/GitHub/scripture-guide-legacy` when porting a format.

### Task 1.9: CI for extension and web, and secret scanning

**Files:**
- Create: `.github/workflows/extension.yml`, `.github/workflows/web.yml`, `.github/workflows/security.yml`, `.github/dependabot.yml`

**Step 1: `extension.yml`**

```yaml
name: chrome-extension
on:
  pull_request:
    paths: ['apps/chrome-extension/**', 'packages/scripture-guide/**', 'package-lock.json', '.github/workflows/extension.yml']
  push:
    branches: [master]
    paths: ['apps/chrome-extension/**', 'packages/scripture-guide/**', 'package-lock.json', '.github/workflows/extension.yml']
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run build -w scripture-guide
      - run: npm test -w scripture-guide-chrome-extension -- --ci
      - run: npm run build -w scripture-guide-chrome-extension
```

**Step 2: `web.yml`** — same shape, paths `apps/web/**` plus the package, steps `npm ci`, build package, `npm test -w @scripture-guide/web`.

**Step 3: `security.yml`**

```yaml
name: security
on: [push, pull_request]
jobs:
  gitleaks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
        env: { GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}' }
```

**Step 4: `dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: monthly }
    groups: { all: { patterns: ['*'] } }
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: monthly }
```

**Step 5: Commit, push, verify all workflows green**

```bash
git add .github && git commit -m "ci: extension, web, gitleaks, dependabot"
git push origin master && gh run list -R kckern/ScriptureGuide -L 5
```

If gitleaks flags history (pre-existing commits in the imported repos), review each finding with KC. Real secrets get rotated; false positives go in `.gitleaksignore` by fingerprint.

### Task 1.10: Archive superseded repos (KC go-ahead required)

Do this after Task 3.3 has shipped the extension from the monorepo.

```bash
for r in ScriptureGuideChromeExtention ScriptureGuideSearch ScriptureGuideApp; do
  gh repo clone kckern/$r "$WORK/$r" && cd "$WORK/$r"
  printf '# Moved\n\nThis project now lives in [kckern/ScriptureGuide](https://github.com/kckern/ScriptureGuide).\n' > README.md
  [ "$r" = ScriptureGuideSearch ] && git rm -q buildspec.yml
  git add -A && git commit -m "Point to kckern/ScriptureGuide" && git push
  gh repo archive kckern/$r --yes; cd -
done
```

Note: removing `buildspec.yml` from the tip does not remove the AWS account ID from history; that ID is low sensitivity, so this is acceptable.

---

## Phase 2: Release pipeline

### Task 2.1: Changesets

**Files:**
- Create: `.changeset/config.json`, `.changeset/README.md`
- Modify: root `package.json`

**Step 1:**

```bash
npm install -D @changesets/cli@^2 && npx changeset init   # at repo root, installs into the root package.json
```

**Step 2: `.changeset/config.json`**

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "master",
  "updateInternalDependencies": "patch",
  "privatePackages": { "version": true, "tag": false },
  "ignore": []
}
```

**Step 3: Root scripts**: add `"version-packages": "changeset version && npm run sync-manifest -w scripture-guide-chrome-extension && npm install --package-lock-only"` and `"release": "changeset publish"`.

**Step 4: Commit**: `git add -A && git commit -m "build: add changesets"`.

### Task 2.2: Keep the extension manifest version in sync (TDD)

**Files:**
- Test: `apps/chrome-extension/test/unit/manifest-version.test.js`
- Create: `apps/chrome-extension/scripts/sync-manifest-version.mjs`
- Modify: `apps/chrome-extension/package.json`

**Step 1: Failing test**

```js
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '../..');
const read = f => JSON.parse(readFileSync(join(root, f), 'utf8'));

describe('manifest version', () => {
  test('matches package.json version', () => {
    expect(read('manifest.json').version).toBe(read('package.json').version);
  });
});
```

**Step 2: Make it fail on purpose**: set `apps/chrome-extension/package.json` version to `2.0.2`; run `npm test -w scripture-guide-chrome-extension -- manifest-version`. Expected: FAIL, `Expected: "2.0.2" Received: "2.0.1"`. Revert the version to `2.0.1`.

**Step 3: Sync script** `apps/chrome-extension/scripts/sync-manifest-version.mjs`:

```js
// Copy package.json "version" into manifest.json. Run by `npm run version-packages`.
import { readFileSync, writeFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
if (manifest.version !== pkg.version) {
  manifest.version = pkg.version;
  writeFileSync('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
}
```

Add `"sync-manifest": "node scripts/sync-manifest-version.mjs"` to the extension's scripts.

**Step 4: Verify**: set version to `2.0.2`, run `npm run sync-manifest -w scripture-guide-chrome-extension`, run the test, expect PASS. `git checkout apps/chrome-extension/package.json apps/chrome-extension/manifest.json`.

**Step 5: Commit**: `git add apps/chrome-extension && git commit -m "build(extension): sync manifest version from package.json"`.

### Task 2.3: Web Docker image from the monorepo

**Files:**
- Create: `apps/web/Dockerfile`, `.dockerignore`
- Delete: `apps/web/docker/`

**Step 1: `apps/web/Dockerfile`** (build context is the repo root)

```dockerfile
FROM node:20-alpine AS base
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/scripture-guide/package.json packages/scripture-guide/
COPY apps/web/package.json apps/web/
COPY apps/chrome-extension/package.json apps/chrome-extension/

FROM base AS pkg
RUN npm ci -w scripture-guide
COPY packages/scripture-guide packages/scripture-guide
RUN npm run build -w scripture-guide

FROM base AS deps
RUN npm ci --omit=dev -w @scripture-guide/web

FROM node:20-alpine
RUN apk add --no-cache ffmpeg
ENV NODE_ENV=production
COPY --from=deps /repo /repo
COPY --from=pkg /repo/packages/scripture-guide/dist /repo/packages/scripture-guide/dist
COPY apps/web /repo/apps/web
WORKDIR /repo/apps/web
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "src/app.js"]
```

**Step 2: `.dockerignore`**

```
**/node_modules
**/.env
.git
data
docs
apps/chrome-extension
!apps/chrome-extension/package.json
packages/scripture-guide/dist/*.mjs
packages/scripture-guide/dist/*.cjs
packages/scripture-guide/src/data
```

**Step 3: Build and smoke test**

```bash
git rm -rq apps/web/docker
docker build -f apps/web/Dockerfile -t sg-web:local .
docker run --rm sg-web:local node --input-type=module -e "import('scripture-guide').then(m=>console.log(m.lookupReference('John 3:16').verse_ids))"
docker run --rm sg-web:local sh -c 'ls /repo/node_modules | grep -cE "^(jest|vitest|webpack|esbuild)$"'
```

Expected: `[ 26137 ]` and `0` dev tools in the image.

**Step 4: Commit**: `git add -A && git commit -m "build(web): monorepo Dockerfile"`.

### Task 2.4: `release.yml`

**Files:**
- Create: `.github/workflows/release.yml`

```yaml
name: release
on:
  push:
    branches: [master]
concurrency: release-${{ github.ref }}
permissions:
  contents: write
  pull-requests: write
  id-token: write
  packages: write

jobs:
  changesets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm', registry-url: 'https://registry.npmjs.org' }
      - run: npm ci
      - run: npm run build -w scripture-guide
      - uses: changesets/action@v1
        with:
          version: npm run version-packages
          publish: npm run release
          title: 'Version packages'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          NPM_CONFIG_PROVENANCE: 'true'

  web-image:
    needs: changesets
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 2 }
      - id: v
        run: |
          echo "version=$(node -p "require('./apps/web/package.json').version")" >> "$GITHUB_OUTPUT"
          if git diff HEAD^1 HEAD -- apps/web/package.json | grep -q '^[-+]  "version"'; then echo "release=true" >> "$GITHUB_OUTPUT"; fi
          echo "short=$(git rev-parse --short HEAD)" >> "$GITHUB_OUTPUT"
      - uses: docker/setup-qemu-action@v3
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: '${{ github.actor }}', password: '${{ secrets.GITHUB_TOKEN }}' }
      - id: build
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/web/Dockerfile
          platforms: linux/amd64,linux/arm64
          push: true
          tags: |
            ghcr.io/kckern/scripture-guide:edge
            ghcr.io/kckern/scripture-guide:sha-${{ steps.v.outputs.short }}
            ${{ steps.v.outputs.release == 'true' && format('ghcr.io/kckern/scripture-guide:{0}', steps.v.outputs.version) || '' }}
            ${{ steps.v.outputs.release == 'true' && 'ghcr.io/kckern/scripture-guide:latest' || '' }}
          labels: org.opencontainers.image.source=https://github.com/kckern/ScriptureGuide
      - uses: sigstore/cosign-installer@v3
      - run: cosign sign --yes ghcr.io/kckern/scripture-guide@${{ steps.build.outputs.digest }}

  extension:
    needs: changesets
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 2 }
      - id: v
        run: |
          if git diff HEAD^1 HEAD -- apps/chrome-extension/package.json | grep -q '^[-+]  "version"'; then echo "release=true" >> "$GITHUB_OUTPUT"; fi
      - if: steps.v.outputs.release == 'true'
        uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - if: steps.v.outputs.release == 'true'
        run: |
          npm ci
          npm run build -w scripture-guide
          npm test -w scripture-guide-chrome-extension -- --ci
          npm run build -w scripture-guide-chrome-extension
          cd apps/chrome-extension/dist && zip -r -q ../extension.zip .
      - if: steps.v.outputs.release == 'true'
        run: npx chrome-webstore-upload-cli@3 upload --source apps/chrome-extension/extension.zip --auto-publish
        env:
          EXTENSION_ID: lkagejkikblabiegfnehlknmlgckhgan
          CLIENT_ID: ${{ secrets.CWS_CLIENT_ID }}
          CLIENT_SECRET: ${{ secrets.CWS_CLIENT_SECRET }}
          REFRESH_TOKEN: ${{ secrets.CWS_REFRESH_TOKEN }}
```

The extension ID comes from the `chrome-webstore-item` link in the live PHP `index.php`. Confirm it in the Web Store dashboard during Task 2.6.

Commit: `git add .github/workflows/release.yml && git commit -m "ci: release workflow for npm, GHCR, Chrome Web Store"`.

Also delete the now-redundant `apps/chrome-extension/deploy.sh` (CI replaces it) in the same commit.

### Task 2.5: Changeset for the first release

```bash
npx changeset   # select scripture-guide-chrome-extension (patch): "Rebuild on scripture-guide 1.0.98 detection fixes"
                # select @scripture-guide/web (patch): "Monorepo build; first public image"
git add .changeset && git commit -m "chore: changesets for first monorepo release"
```

`scripture-guide` is already at 1.0.98, unpublished; `changeset publish` publishes any version not on npm, so it needs no changeset.

### Task 2.6: Secrets and first run (KC go-ahead required)

**Step 1: npm.** Create a granular automation token on npmjs.com limited to `scripture-guide` with publish rights: `gh secret set NPM_TOKEN -R kckern/ScriptureGuide`.

**Step 2: Chrome Web Store OAuth.** Follow https://github.com/fregante/chrome-webstore-upload-keys to create a client ID, secret, and refresh token. Set `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` with `gh secret set`.

**Step 3: Push and merge the Version PR**

```bash
git push origin master
gh pr list -R kckern/ScriptureGuide --head changeset-release/master
gh pr merge <n> -R kckern/ScriptureGuide --squash
gh run watch -R kckern/ScriptureGuide $(gh run list -R kckern/ScriptureGuide -w release -L1 --json databaseId -q '.[0].databaseId')
```

**Step 4: Make the GHCR package public.** github.com/users/kckern/packages/container/scripture-guide/settings → Change visibility → Public. (No API for this.)

**Step 5: Verify**

```bash
npm view scripture-guide version dist.attestations.url        # 1.0.98, provenance present
docker pull ghcr.io/kckern/scripture-guide:latest              # works logged out: docker logout ghcr.io first
cosign verify ghcr.io/kckern/scripture-guide:latest --certificate-identity-regexp 'https://github.com/kckern/ScriptureGuide/' --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

Expected: all succeed. The Web Store dashboard shows the new version in review.

---

## Phase 3: Extension republish

### Task 3.1: Confirm what the Web Store serves

```bash
curl -sL "https://chromewebstore.google.com/detail/lkagejkikblabiegfnehlknmlgckhgan" | grep -oE '"version":"[0-9.]+"|Version[^<]{0,20}' | head -3
```

If this does not parse, check the dashboard by hand. Record the live version. If 2.0.1 was never live, Task 2.6 shipping 2.0.2 resolves it; otherwise this phase is only Task 3.2.

### Task 3.2: Move slug logic into the package (TDD)

**Files:**
- Create: `packages/scripture-guide/src/slug.mjs`
- Test: `packages/scripture-guide/test/unit/slug.test.js`
- Modify: `packages/scripture-guide/src/scriptures.mjs:1125` (export block), `packages/scripture-guide/dist/scriptures.d.ts`
- Modify: `apps/chrome-extension/src/**` (callers of `refToSlug`)
- Delete: `apps/chrome-extension/src/shared/slug.js`, `apps/chrome-extension/test/unit/slug.test.js`

**Step 1: Failing test** `packages/scripture-guide/test/unit/slug.test.js` (cases carried over from the extension):

```js
import { toSlug } from '../../src/scriptures.mjs';

describe('toSlug', () => {
  test('simple verse', () => {
    expect(toSlug('John 3:16')).toBe('john.3.16');
  });
  test('numbered book and range', () => {
    expect(toSlug('1 Nephi 3:7-10')).toBe('1.nephi.3.7-10');
  });
  test('normalizes en-dash and em-dash ranges to hyphen', () => {
    expect(toSlug('Matthew 5:3–12')).toBe('matthew.5.3-12');
    expect(toSlug('Matthew 5:3—12')).toBe('matthew.5.3-12');
  });
  test('compound refs keep semicolons, drop redundant dots', () => {
    expect(toSlug('Exodus 5:1; Leviticus 6:2')).toBe('exodus.5.1;leviticus.6.2');
  });
  test('split verses keep commas', () => {
    expect(toSlug('Exodus 20:5,10')).toBe('exodus.20.5,10');
  });
  test('trims and lowercases', () => {
    expect(toSlug('  Genesis 1:1  ')).toBe('genesis.1.1');
  });
});
```

**Step 2:** `npm run test:jest -w scripture-guide -- slug` → FAIL (`toSlug is not a function`).

**Step 3: Implement** `packages/scripture-guide/src/slug.mjs`:

```js
// Convert a reference string (e.g. "John 3:16-18") into a scripture.guide URL
// slug (e.g. "john.3.16-18"): dashes normalized to "-", whitespace/colons to
// ".", ";" and "," kept as compound/split separators.
export function toSlug(ref) {
  return ref.trim().toLowerCase()
    .replace(/[־᠆‐‒–—―﹣－‑]+/gu, '-')
    .replace(/[\s:]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/;\./g, ';')
    .replace(/,\./g, ',')
    .replace(/\.;/g, ';')
    .replace(/\.,/g, ',');
}
```

In `src/scriptures.mjs` add `import { toSlug } from './slug.mjs';` with the other imports, and `toSlug,` in the export block after `convertCanon,`. In `dist/scriptures.d.ts` add:

```ts
/** Convert a reference string into a scripture.guide URL slug, e.g. "John 3:16" -> "john.3.16". */
export function toSlug(ref: string): string;
```

**Step 4:** `npm run build -w scripture-guide && npm run test:jest -w scripture-guide -- slug` → PASS. Also run the full critical suite.

**Step 5: Switch the extension**

```bash
grep -rln "refToSlug\|shared/slug" apps/chrome-extension/src apps/chrome-extension/test
```

In each file, replace `import { refToSlug } from '<path>/shared/slug.js'` with `import { toSlug } from 'scripture-guide'` and rename calls. Delete `src/shared/slug.js` and its test. Run `npm test -w scripture-guide-chrome-extension` → PASS.

**Step 6: Changesets and commit**

```bash
npx changeset   # scripture-guide minor: "Add toSlug"; chrome-extension patch: "Use toSlug from scripture-guide"
git add -A && git commit -m "feat(pkg): add toSlug; extension uses it"
```

### Task 3.3: Ship it (KC go-ahead required)

Push, merge the Version PR, confirm npm shows `1.1.0` and the Web Store dashboard shows the new extension version submitted. Then run Task 1.10.

---

## Phase 4: Seeds and local stack

### Task 4.1: Schema DDL

**Files:**
- Create: `data/seeds/schema.sql`

**Step 1: Dump structure through an SSH tunnel to bom**, using `sg_reader`:

```bash
ssh -f -N -L 13306:127.0.0.1:3306 bom
mysqldump -h 127.0.0.1 -P 13306 -u sg_reader -p --no-data --skip-add-drop-table --skip-comments --no-tablespaces "scripture.guide" \
  | sed -E 's/ AUTO_INCREMENT=[0-9]+//; s/DEFINER=`[^`]+`@`[^`]+`//' > data/seeds/schema.sql
grep -c "CREATE TABLE" data/seeds/schema.sql
```

**Step 2: Remove tables not carried forward**: delete the `CREATE TABLE` blocks for `tmp_authorship`, `tmp_sentances`, `users`, `user_prefs`, and `social_queue`, plus any table the web app never queries. Before deleting `user_prefs`, run `grep -rn user_prefs apps/web/src ~/Documents/GitHub/scripture-guide-legacy/php | head` and keep it if the web app reads it.

**Step 3: Verify it loads**

```bash
docker run -d --rm --name schematest -e MYSQL_ROOT_PASSWORD=x -e MYSQL_DATABASE=scripture_guide mysql:8.0 && sleep 25
docker exec -i schematest mysql -px scripture_guide < data/seeds/schema.sql && docker exec schematest mysql -px -e "SHOW TABLES" scripture_guide; docker stop schematest
```

**Step 4: Commit**: `git add data/seeds/schema.sql && git commit -m "data: scripture.guide schema DDL"`.

### Task 4.2: Seed manifest and allow-list check (TDD)

**Files:**
- Create: `data/seeds/manifest.json`, `scripts/seeds/check-seeds.mjs`
- Test: `scripts/seeds/check-seeds.test.mjs`
- Modify: root `package.json`

**Step 1: Manifest.** Read `data/seeds/schema.sql` and list each table the web app reads (`grep -rhoE "FROM [a-z_]+|JOIN [a-z_]+" apps/web/src | sort -u`). For each, decide with KC whether it is structural (no licensed content, export all rows), version-scoped (export only rows for public versions), or excluded. Write:

```json
{
  "publicVersions": ["KJV"],
  "tables": {
    "scripture_versions": { "scope": "version", "versionColumn": "id" },
    "scripture_verses": { "scope": "version", "versionColumn": "version" },
    "lds_scriptures_volumes": { "scope": "all" },
    "lds_scriptures_books": { "scope": "all" }
  }
}
```

Every table the app reads must appear. Tables whose text is licensed but which have no version column (for example `lds_scriptures_verses` if it carries LDS-edition text) must be `"scope": "all", "columns": [...]` with text columns omitted, so only structural columns export. Confirm each such choice with KC.

**Step 2: Failing test** `scripts/seeds/check-seeds.test.mjs` (Node's built-in runner):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findViolations } from './check-seeds.mjs';

const manifest = { publicVersions: ['KJV'], tables: { scripture_verses: { scope: 'version', versionColumn: 'version' } } };

test('accepts a seed whose versions are all public', () => {
  assert.deepEqual(findViolations(manifest, { scripture_verses: ['KJV'] }), []);
});

test('rejects a seed containing a non-public version', () => {
  assert.deepEqual(findViolations(manifest, { scripture_verses: ['KJV', 'NIV'] }), ['scripture_verses: NIV is not in publicVersions']);
});

test('rejects a seed file for a table missing from the manifest', () => {
  assert.deepEqual(findViolations(manifest, { scripture_headings: [] }), ['scripture_headings: not in manifest']);
});
```

**Step 3:** `node --test scripts/seeds/` → FAIL (module not found).

**Step 4: Implement** `scripts/seeds/check-seeds.mjs`:

```js
// Guard against licensed text in data/seeds. Each seed file is
// data/seeds/<table>.sql.gz; version-scoped tables are checked for the
// distinct values of their version column in the INSERT statements.
import { readFileSync, readdirSync } from 'fs';
import { gunzipSync } from 'zlib';
import { fileURLToPath } from 'url';

export function findViolations(manifest, versionsByTable) {
  const out = [];
  for (const [table, versions] of Object.entries(versionsByTable)) {
    const spec = manifest.tables[table];
    if (!spec) { out.push(`${table}: not in manifest`); continue; }
    if (spec.scope !== 'version') continue;
    for (const v of versions) {
      if (!manifest.publicVersions.includes(v)) out.push(`${table}: ${v} is not in publicVersions`);
    }
  }
  return out;
}

// Seeds are written by export-seed with the version column first in every row,
// so the first quoted value of each tuple is the version.
function versionsInSeed(sql) {
  return [...new Set([...sql.matchAll(/\(\s*'((?:[^'\\]|\\.)*)'/g)].map(m => m[1]))];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = new URL('../../data/seeds/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));
  const found = {};
  for (const f of readdirSync(dir).filter(f => f.endsWith('.sql.gz'))) {
    const table = f.replace(/\.sql\.gz$/, '');
    const spec = manifest.tables[table];
    found[table] = spec?.scope === 'version' ? versionsInSeed(gunzipSync(readFileSync(new URL(f, dir))).toString()) : [];
  }
  const v = findViolations(manifest, found);
  if (v.length) { console.error(v.join('\n')); process.exit(1); }
  console.log(`seeds ok: ${Object.keys(found).length} tables`);
}
```

**Step 5:** `node --test scripts/seeds/` → PASS. Add root script `"check-seeds": "node scripts/seeds/check-seeds.mjs"`.

**Step 6: Commit**: `git add data/seeds/manifest.json scripts/seeds package.json && git commit -m "data: seed manifest and public-version guard"`.

### Task 4.3: `export-seed` (TDD on the pure part)

**Files:**
- Create: `scripts/seeds/export-seed.mjs`
- Test: `scripts/seeds/export-seed.test.mjs`

**Step 1: Failing test** for the query builder:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSelect } from './export-seed.mjs';

test('version scope puts the version column first and filters', () => {
  const { sql, params } = buildSelect('scripture_verses', { scope: 'version', versionColumn: 'version' }, ['version', 'verse_id', 'text'], ['KJV']);
  assert.equal(sql, 'SELECT `version`, `verse_id`, `text` FROM `scripture_verses` WHERE `version` IN (?) ORDER BY 1, 2');
  assert.deepEqual(params, [['KJV']]);
});

test('all scope with column subset', () => {
  const { sql } = buildSelect('lds_scriptures_verses', { scope: 'all', columns: ['verse_id', 'book_id'] }, ['verse_id', 'book_id', 'scripture_text'], []);
  assert.equal(sql, 'SELECT `verse_id`, `book_id` FROM `lds_scriptures_verses` ORDER BY 1');
});
```

**Step 2:** `node --test scripts/seeds/export-seed.test.mjs` → FAIL.

**Step 3: Implement** `scripts/seeds/export-seed.mjs`:

```js
// Export public-domain seed data from the private database into
// data/seeds/<table>.sql.gz. Run locally through the bom tunnel:
//   DATABASE_URL=mysql://sg_reader:...@127.0.0.1:13306/scripture.guide node scripts/seeds/export-seed.mjs
import { readFileSync, writeFileSync } from 'fs';
import { gzipSync } from 'zlib';
import { fileURLToPath } from 'url';

const q = id => '`' + id + '`';

export function buildSelect(table, spec, allColumns, publicVersions) {
  let cols = spec.columns ?? allColumns;
  if (spec.scope === 'version') cols = [spec.versionColumn, ...cols.filter(c => c !== spec.versionColumn)];
  const where = spec.scope === 'version' ? ` WHERE ${q(spec.versionColumn)} IN (?)` : '';
  const order = spec.scope === 'version' ? ' ORDER BY 1, 2' : ' ORDER BY 1';
  return { sql: `SELECT ${cols.map(q).join(', ')} FROM ${q(table)}${where}${order}`, params: spec.scope === 'version' ? [publicVersions] : [], cols };
}

async function main() {
  const { createConnection } = await import('mysql2/promise');
  const conn = await createConnection(process.env.DATABASE_URL);
  const dir = new URL('../../data/seeds/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));
  for (const [table, spec] of Object.entries(manifest.tables)) {
    const [colRows] = await conn.query('SELECT column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position', [table]);
    const { sql, params, cols } = buildSelect(table, spec, colRows.map(r => r.c), manifest.publicVersions);
    const [rows] = await conn.query({ sql, values: params, rowsAsArray: true });
    const lines = [];
    for (let i = 0; i < rows.length; i += 500) {
      const values = rows.slice(i, i + 500).map(r => '(' + r.map(v => conn.escape(v)).join(',') + ')').join(',\n');
      lines.push(`INSERT INTO ${q(table)} (${cols.map(q).join(',')}) VALUES\n${values};`);
    }
    writeFileSync(new URL(`${table}.sql.gz`, dir), gzipSync(lines.join('\n') + '\n'));
    console.log(`${table}: ${rows.length} rows`);
  }
  await conn.end();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
```

Add `mysql2` to root devDependencies: `npm install -D mysql2` at the repo root.

**Step 4:** `node --test scripts/seeds/` → PASS.

**Step 5: Export for real**

```bash
DATABASE_URL="mysql://sg_reader:$(read -s p; echo $p)@127.0.0.1:13306/scripture.guide" node scripts/seeds/export-seed.mjs
du -sh data/seeds/*.sql.gz && npm run check-seeds
```

Expected: `scripture_verses` around 31k–42k rows for KJV (Bible only vs. Bible plus LDS-standard-works numbering), total under 20 MB, and `seeds ok`.

**Step 6:** For each table in the manifest, add a line to `data/seeds/SOURCE.md`: table, scope, row count, and license basis (KJV: public domain in the US). Commit:

```bash
git add data/seeds scripts/seeds package.json package-lock.json && git commit -m "data: KJV public-domain seed export"
```

### Task 4.4: Seed image, Sphinx config, and local compose

**Files:**
- Create: `infra/seed/Dockerfile`, `infra/sphinx/sphinx.conf`, `infra/docker-compose.yml`, `infra/README.md`

**Step 1: `infra/seed/Dockerfile`** (context: repo root)

```dockerfile
FROM mysql:8.0
ENV MYSQL_DATABASE=scripture_guide
COPY data/seeds/schema.sql /docker-entrypoint-initdb.d/00-schema.sql
COPY data/seeds/*.sql.gz /docker-entrypoint-initdb.d/
```

MySQL's entrypoint runs `.sql` and `.sql.gz` files alphabetically, so schema (`00-`) loads first. Remove `data` from `.dockerignore` for this image by building it with its own ignore file: create `infra/seed/Dockerfile.dockerignore` containing `*` then `!data/seeds/`.

**Step 2: `infra/sphinx/sphinx.conf`** (shebang makes Sphinx run it through sh, so credentials come from the environment at start, not build):

```sh
#!/bin/sh
cat <<EOF
source sg
{
  type      = mysql
  sql_host  = ${MYSQL_HOST}
  sql_user  = ${MYSQL_USER}
  sql_pass  = ${MYSQL_PASSWORD}
  sql_db    = ${MYSQL_DATABASE}
  sql_port  = ${MYSQL_PORT:-3306}
  sql_query = SELECT id, verse_id, version, book_id, text FROM scripture_verses
  sql_attr_uint   = book_id
  sql_attr_uint   = verse_id
  sql_attr_string = version
}
EOF
```

Then copy the `index sgindex { ... }`, `indexer`, and `searchd` sections from production `sphinx.conf` (in the private infra repo) (index path → `/opt/sphinx/index/sgindex`), keeping `morphology = stem_en`, `min_infix_len = 1`, `ngram_len = 1`, and the charset table, all inside the heredoc. Compare against the archived ScriptureGuideSearch `sphinx.conf` and keep the production values where they differ.

**Step 3: `infra/docker-compose.yml`**

```yaml
services:
  db:
    build: { context: .., dockerfile: infra/seed/Dockerfile }
    image: ghcr.io/kckern/scripture-guide-seed:local
    environment:
      MYSQL_ROOT_PASSWORD: dev
      MYSQL_USER: sg
      MYSQL_PASSWORD: dev
    ports: ["127.0.0.1:3307:3306"]
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1", "-usg", "-pdev"]
      interval: 5s
      retries: 30
  sphinx:
    image: macbre/sphinxsearch:3.4.1
    environment: { MYSQL_HOST: db, MYSQL_USER: sg, MYSQL_PASSWORD: dev, MYSQL_DATABASE: scripture_guide }
    volumes: ["./sphinx/sphinx.conf:/opt/sphinx/conf/sphinx.conf:ro"]
    command: sh -c "indexer --all --config /opt/sphinx/conf/sphinx.conf && searchd --nodetach --config /opt/sphinx/conf/sphinx.conf"
    depends_on: { db: { condition: service_healthy } }
  web:
    build: { context: .., dockerfile: apps/web/Dockerfile }
    environment:
      MYSQL_HOST: db
      MYSQL_USER: sg
      MYSQL_PASSWORD: dev
      MYSQL_DATABASE: scripture_guide
      SPHINX_API: http://sphinx:9312
      SESSION_SECRET: dev
    ports: ["127.0.0.1:3000:3000"]
    depends_on: { db: { condition: service_healthy }, sphinx: { condition: service_started } }
```


**Step 4: Bring it up and check**

```bash
docker compose -f infra/docker-compose.yml up -d --build
docker compose -f infra/docker-compose.yml ps
curl -s localhost:3000/health
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/John.3.16
curl -s localhost:3000/John.3.16 | grep -o "For God so loved the world" | head -1
curl -s "localhost:3000/api/John.3.16" | head -c 400
```

Expected: health ok, 200, the KJV text appears. Failures here (missing tables the manifest left out, `bom_prd` assumptions in the app, the Sphinx client using a different port) are expected discoveries: fix the manifest or config, re-export if needed, and record anything that belongs in Plan 2 in `infra/README.md` under "Known gaps".

**Step 5: `infra/README.md`**: how to run the local stack, and the Known gaps list.

**Step 6: Commit**: `git add infra .dockerignore && git commit -m "infra: seed image, env-driven sphinx config, local compose"`.

### Task 4.5: Publish the seed image and check seeds in CI

**Files:**
- Modify: `.github/workflows/release.yml`, `.github/workflows/security.yml`

**Step 1:** In `security.yml` add a job:

```yaml
  seeds:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: node --test scripts/seeds/ && node scripts/seeds/check-seeds.mjs
```

**Step 2:** In `release.yml` add a `seed-image` job like `web-image`, built from `infra/seed/Dockerfile`, tagged `ghcr.io/kckern/scripture-guide-seed:latest` and `:sha-<short>`, run only when `git diff --name-only HEAD^1 HEAD` touches `data/seeds/`. Single platform is fine (`mysql:8.0` is multi-arch, so keep both).

**Step 3:** Push, confirm both workflows green, make the `scripture-guide-seed` package public in GHCR settings, and verify a clean machine path:

```bash
docker logout ghcr.io; docker pull ghcr.io/kckern/scripture-guide-seed:latest
```

**Step 4: Commit** the workflow changes.

### Task 4.6: Local folder rename (KC, outside the session)

Run in a plain terminal, then reopen Claude Code in the new path:

```bash
cd ~/Documents/GitHub && mv ScriptureGuideUtils ScriptureGuide && cd ScriptureGuide && git worktree prune && git remote -v
rm -rf ~/Documents/GitHub/ScriptureGuideChromeExtention   # only after Task 1.10
```

### Task 4.7: Write Plan 2

Using superpowers:writing-plans, write `docs/plans/<date>-scriptureguide-parity-cutover.md` covering design Phases 5–7: the parity harness, the query resolver and renderer registry, one task per output format (`html`, `api`, `meta`, `parallel`, `raw`, `plain`, `markdown`, `xml`, `latex`, `notes`, `audio`, `slide`, `img`/`imgc`, `cover`, `fax`, `hub`, search), legacy route redirects, `/healthz`, the bom blue-green deploy for the web image, staging at `next.scripture.guide`, cutover, PHP retirement, and the editorial CLI. Base it on the local stack from Task 4.4 and its Known gaps list.
