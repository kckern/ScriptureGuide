# Release Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** One push to master ships everything it should. The website always deploys. npm and the Chrome Web Store release when the push carries a changeset. Nothing ships if tests fail, and the store's verdict is reported back.

**Architecture:** One reusable test workflow gates `release.yml`. A new `version` job in `release.yml` replaces the changesets bot PR: it applies pending changesets, commits the version bump straight to master, and tells the publish jobs (web image, npm, Chrome Web Store) what changed. Chrome Web Store API calls move into one script that is shared by the release job, an hourly status workflow and the local skills. Rollback retags `:edge` to an older signed image, which the existing autodeploy on bom picks up with no change on the server.

**Tech Stack:** GitHub Actions, Changesets CLI (`changeset version` only, not `changesets/action`), Node 24 / npm 11 (npm trusted publishing), Docker buildx + cosign, Chrome Web Store API v2, Google workload identity federation, vitest (web), jest (package, extension), actionlint, shellcheck.

---

## Context the engineer needs

- **Work directly on master.** KC is the only maintainer and wants no feature branches or PRs. Commit and push after each task. Push over SSH (`git@github.com:kckern/ScriptureGuide.git`): the HTTPS token lacks `workflow` scope.
- **Production deploy:** bom runs `~/scripture-guide/autodeploy.sh` every minute (source: private repo `kckern/bom-infra`, `scripture-guide/autodeploy.sh`). It pulls `ghcr.io/kckern/scripture-guide:edge` and checks the cosign signature. The identity must match `release.yml@refs/heads/master`. It then pins the digest, waits for the container to be healthy and rolls back if it isn't. **Do not rename `release.yml`**, or every deploy fails the signature check.
- **Packages:** `packages/scripture-guide` (npm `scripture-guide`, public), `apps/web` (`@scripture-guide/web`, private, Docker image), `apps/chrome-extension` (`scripture-guide-chrome-extension`, private, store item `lkagejkikblabiegfnehlknmlgckhgan`). `npm run version-packages` runs `changeset version`, copies the extension version into `manifest.json`, and refreshes the lockfile.
- **Chrome Web Store auth:** GitHub OIDC → workload identity provider `projects/1065695413052/locations/global/workloadIdentityPools/github/providers/scriptureguide` → service account `cws-publisher@book-of-mormon-online.iam.gserviceaccount.com`. The provider only accepts `kckern/ScriptureGuide` on `refs/heads/master`. The repo variable `CWS_PUBLISHER_ID` holds the publisher id.
- **npm:** the repo variable `NPM_PUBLISH=true` is set. Publishing still fails with E404 until KC adds a Trusted Publisher on npmjs.com (Task 11). That's expected until then.
- **Tooling for checking workflows:** `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest` and `docker run --rm -v "$PWD":/mnt koalaman/shellcheck:stable <file>`.
- **Writing rules (KC's CLAUDE.md):** plain wording. Avoid "genuine(ly)", "honest(ly)", "quiet(ly)", "silent(ly)", "load-bearing" and "it's not X, it's Y". This applies to comments, commit messages and skills too.

## Current state (2026-11-20)

| Workflow | Trigger | Problem fixed by |
|---|---|---|
| `release.yml` | push master | Image builds and deploys even if tests fail (Task 3). Version bumps need the bot PR (Task 4). |
| `web.yml`, `extension.yml`, `package.yml` | PR + push | Run in parallel with the release and gate nothing. They duplicate setup (Task 2). |
| `stack.yml`, `security.yml` | PR + push | Unchanged by this plan. |
| none | | No store status (Task 6), no rollback (Task 7), no Dependabot merging (Task 8), no skills (Task 9). |

---

### Task 1: Move to Node 24

Node 20 reached end of life in April 2026. Node 24 ships npm 11, which trusted publishing needs.

**Files:**
- Modify: `.github/workflows/release.yml` (every `node-version: '20'`)
- Modify: `.github/workflows/web.yml`, `extension.yml`, `package.yml`, `security.yml` (every `node-version: '20'`)
- Modify: `apps/web/Dockerfile:2` and `:17` (`node:20-alpine` → `node:24-alpine`)
- Modify: `package.json` (`"engines": { "node": ">=24" }`)

**Step 1: Run every suite under Node 24 before changing anything**

```bash
docker run --rm -v "$PWD":/repo -w /repo node:24-alpine sh -c '
  npm ci --no-audit --no-fund &&
  npm run build -w scripture-guide &&
  npm run test:jest -w scripture-guide -- --ci --testPathIgnorePatterns known-issues &&
  npm test -w @scripture-guide/web &&
  npm test -w scripture-guide-chrome-extension -- --ci &&
  npm run build -w scripture-guide-chrome-extension'
```

Expected: all pass. If a suite fails only on 24, fix it in this task before continuing. The container writes `node_modules` for Linux, so afterwards run `npm ci` on the Mac to restore native modules.

**Step 2: Change the versions**

```bash
grep -rl "node-version: '20'" .github/workflows | xargs sed -i '' "s/node-version: '20'/node-version: '24'/"
sed -i '' 's/node:20-alpine/node:24-alpine/' apps/web/Dockerfile
sed -i '' 's/"node": ">=20"/"node": ">=24"/' package.json
grep -rn "node-version\|node:2" .github/workflows apps/web/Dockerfile
```

Expected: every hit says 24.

**Step 3: Build the image locally**

```bash
docker build -f apps/web/Dockerfile -t sg-web:node24 . && docker run --rm sg-web:node24 node --version
```

Expected: `v24.x`.

**Step 4: Commit and push, then watch the release**

```bash
git add -A .github/workflows apps/web/Dockerfile package.json
git commit -m "build: move CI and the web image to Node 24"
git push origin master
gh run watch $(gh run list --workflow release.yml -L 1 --json databaseId --jq '.[0].databaseId') --exit-status
```

Expected: success. Within 3 minutes, `curl -s https://scripture.guide/healthz` returns `"status":"ok"`.

---

### Task 2: One reusable test workflow

Replace `web.yml`, `extension.yml` and `package.yml` with one `test.yml`. It runs on pull requests and is called by `release.yml` (Task 3) and the Dependabot workflow (Task 8).

**Files:**
- Create: `.github/workflows/test.yml`
- Delete: `.github/workflows/web.yml`, `.github/workflows/extension.yml`, `.github/workflows/package.yml`

**Step 1: Check which package tests the full run includes**

```bash
npm run test:jest -w scripture-guide -- --ci --testPathIgnorePatterns known-issues 2>&1 | tail -5
```

Expected: all pass. The known-issues suite is report-only by design, so it is excluded from the gate.

**Step 2: Write `.github/workflows/test.yml`**

```yaml
name: test
# Gates every release (called by release.yml and dependabot.yml) and checks pull requests.
on:
  pull_request:
  workflow_call:
    inputs:
      ref:
        description: Commit to test (defaults to the triggering commit)
        type: string
        required: false
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v7
        with: { ref: '${{ inputs.ref }}' }
      - uses: actions/setup-node@v7
        with: { node-version: '24', cache: 'npm' }
      - run: npm ci
      - run: npm run build -w scripture-guide
      - name: scripture-guide package
        run: npm run test:jest -w scripture-guide -- --ci --testPathIgnorePatterns known-issues
      - name: website
        run: npm test -w @scripture-guide/web
      - name: Chrome extension
        run: |
          npm test -w scripture-guide-chrome-extension -- --ci
          npm run build -w scripture-guide-chrome-extension

  # Report only: parser cases known to fail. Never blocks a release.
  known-issues:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    continue-on-error: true
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: '24', cache: 'npm' }
      - run: npm ci
      - run: npm run build -w scripture-guide
      - run: npm run test:known-issues -w scripture-guide -- --ci
```

**Step 3: Delete the three old workflows and lint**

```bash
git rm .github/workflows/web.yml .github/workflows/extension.yml .github/workflows/package.yml
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest
```

Expected: no output from actionlint.

**Step 4: Commit** (don't push yet: `test.yml` has no push trigger, so this commit is checked by Task 3's release run)

```bash
git add .github/workflows/test.yml
git commit -m "ci: one reusable test workflow replaces web, extension and package"
```

---

### Task 3: Tests gate the release, and the image records its commit

**Files:**
- Modify: `apps/web/src/app/routes/legacy.js:65-75` (`/healthz`)
- Test: `apps/web/test/unit/legacyRoutes.test.js:59-75`
- Modify: `apps/web/Dockerfile` (final stage)
- Modify: `.github/workflows/release.yml`

**Step 1: Write the failing test**

Add to the `describe('/healthz')` block in `apps/web/test/unit/legacyRoutes.test.js`:

```js
  it('reports the commit and version it runs', async () => {
    process.env.SG_COMMIT = 'abc1234def';
    try {
      const res = await request(appWith({ checkDb: async () => {}, checkSphinx: async () => null })).get('/healthz');
      expect(res.body.commit).toBe('abc1234def');
      expect(res.body.version).toMatch(/^\d+\.\d+\.\d+$/);
    } finally {
      delete process.env.SG_COMMIT;
    }
  });
```

Change the two existing `toEqual` expectations to `toMatchObject` so the new fields don't break them.

**Step 2: Run it and watch it fail**

Run: `npx vitest run test/unit/legacyRoutes.test.js` (from `apps/web`)
Expected: FAIL, `expected undefined to be 'abc1234def'`.

**Step 3: Implement**

At the top of `apps/web/src/app/routes/legacy.js`, next to the other imports, add:

```js
import { readFileSync } from 'fs';
const WEB_VERSION = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')).version;
```

(Check the import style first. If the file uses `require`, use `require('../../../package.json').version` instead.)

In the `/healthz` handler, change the first line to:

```js
    const body = { status: 'ok', db: 'ok', version: WEB_VERSION, commit: process.env.SG_COMMIT || 'dev' };
```

**Step 4: Run the web suite**

Run: `npm test -w @scripture-guide/web`
Expected: all pass.

**Step 5: Bake the commit into the image**

In `apps/web/Dockerfile`, in the final stage, after `ENV NODE_ENV=production`, add:

```dockerfile
# Set by CI (release.yml) so /healthz shows which commit is live. Last, so it never busts the layer cache.
ARG SG_COMMIT=dev
ENV SG_COMMIT=$SG_COMMIT
```

**Step 6: Gate `release.yml` on tests, and tag the full sha**

In `.github/workflows/release.yml`:

1. Add a `test` job at the top of `jobs:`:

```yaml
  test:
    uses: ./.github/workflows/test.yml
```

2. Add `needs: test` to `web-image-build`, `extension` and `changesets`. Task 4 replaces `changesets`.
3. In `web-image-build`'s `docker/build-push-action` step, add:

```yaml
          build-args: SG_COMMIT=${{ github.sha }}
```

4. In the `web-image` publish step, add the full sha to the tags so rollback (Task 7) can find any image without guessing the short sha length:

```bash
          tags=(-t "$IMAGE:edge" -t "$sha_tag" -t "$IMAGE:sha-$(git -C "$GITHUB_WORKSPACE" rev-parse HEAD)")
```

**Step 7: Lint, commit, push, verify**

```bash
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest
git add apps/web .github/workflows/release.yml
git commit -m "ci(release): tests gate every release; /healthz reports the live commit"
git push origin master
gh run watch $(gh run list --workflow release.yml -L 1 --json databaseId --jq '.[0].databaseId') --exit-status
sleep 180; curl -s https://scripture.guide/healthz
```

Expected: the run graph shows `test` before the image build. `/healthz` shows `"commit":"<the pushed sha>"`.

**Step 8: Prove the gate works**

Push a commit with a deliberately failing web test, for example `expect(1).toBe(2)` in a new `apps/web/test/unit/gate.test.js`. The run must show `test` failed and `web-image-build` skipped. `/healthz` must still show the previous commit. Then `git revert HEAD && git push origin master`.

---

### Task 4: Version bumps commit straight to master (no bot PR)

Replace the `changesets` job with a `version` job. When the push contains changeset files, it runs `npm run version-packages`, commits `chore: release …` to master and outputs what changed. A push made with `GITHUB_TOKEN` does not start another workflow run, so this run carries on with the release commit.

**Files:**
- Modify: `.github/workflows/release.yml`

**Step 1: Replace the `changesets` job with `version`**

```yaml
  # Applies pending changesets (.changeset/*.md) and commits the version bump to master. The
  # jobs below build and publish that commit. A push without changesets passes through
  # unchanged: the website still deploys, and nothing is published to npm or the store.
  version:
    needs: test
    runs-on: ubuntu-latest
    timeout-minutes: 10
    outputs:
      sha: ${{ steps.v.outputs.sha }}
      package: ${{ steps.v.outputs.package }}
      web: ${{ steps.v.outputs.web }}
      extension: ${{ steps.v.outputs.extension }}
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: '24', cache: 'npm' }
      - id: v
        run: |
          ver() { node -p "require('./$1/package.json').version"; }
          before_pkg=$(ver packages/scripture-guide); before_web=$(ver apps/web); before_ext=$(ver apps/chrome-extension)
          if find .changeset -name '*.md' ! -name README.md | grep -q .; then
            npm ci --ignore-scripts
            npm run version-packages
            pkg=$(ver packages/scripture-guide); web=$(ver apps/web); ext=$(ver apps/chrome-extension)
            msg="chore: release"
            [ "$pkg" != "$before_pkg" ] && msg="$msg scripture-guide@$pkg"
            [ "$web" != "$before_web" ] && msg="$msg web@$web"
            [ "$ext" != "$before_ext" ] && msg="$msg extension@$ext"
            git config user.name 'github-actions[bot]'
            git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
            git add -A
            git commit -m "$msg"
            git pull --rebase origin master
            git push origin HEAD:master
          fi
          echo "sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"
          [ "$(ver packages/scripture-guide)" != "$before_pkg" ] && echo "package=true" >> "$GITHUB_OUTPUT"
          [ "$(ver apps/web)" != "$before_web" ] && echo "web=true" >> "$GITHUB_OUTPUT"
          [ "$(ver apps/chrome-extension)" != "$before_ext" ] && echo "extension=true" >> "$GITHUB_OUTPUT"
          true
```

**Step 2: Point every publish job at the release commit**

- `web-image-build`, `web-image`, `extension`: change `needs` to include `version`. Add `with: { ref: '${{ needs.version.outputs.sha }}' }` to each `actions/checkout` (keep `fetch-depth` where present). Change `build-args` to `SG_COMMIT=${{ needs.version.outputs.sha }}`.
- `web-image` publish step: replace the `git diff HEAD^1 HEAD -- apps/web/package.json | grep …` condition with `[ "$WEB_RELEASE" = true ]`, adding `env: { WEB_RELEASE: '${{ needs.version.outputs.web }}' }`.
- `extension` job: delete the `id: v` step. Its other steps use `if: needs.version.outputs.extension == 'true' || inputs.extension`, and the `npm test` line goes, because `test` already ran.
- Add a dispatch input at the top so a failed upload can be retried without a new version:

```yaml
on:
  push:
    branches: [master]
  workflow_dispatch:
    inputs:
      extension:
        description: Upload the current extension version to the Chrome Web Store again
        type: boolean
        default: false
```

- Remove `pull-requests: write` from the top-level `permissions` once nothing uses it. (Task 8's workflow has its own.)

**Step 3: Add the npm job**

```yaml
  # Publishes scripture-guide with npm trusted publishing (GitHub OIDC, no token). Needs the
  # repo variable NPM_PUBLISH=true and a Trusted Publisher entry on npmjs.com for release.yml.
  npm:
    needs: version
    if: vars.NPM_PUBLISH == 'true' && needs.version.outputs.package == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7
        with: { ref: '${{ needs.version.outputs.sha }}' }
      - uses: actions/setup-node@v7
        with: { node-version: '24', cache: 'npm', registry-url: 'https://registry.npmjs.org' }
      - run: npm ci
      - run: npm run build -w scripture-guide
      - run: npm publish -w scripture-guide --provenance --access public
```

**Step 4: Remove the old bot PR machinery**

```bash
gh pr list --head changeset-release/master --json number --jq '.[].number' | xargs -I{} gh pr close {} --delete-branch
git push origin --delete changeset-release/master 2>/dev/null || true
```

`changesets/action` is no longer used, so also close Dependabot PR #28 ("Bump changesets/action from 1 to 2"): `gh pr close 28 --comment "No longer used: release.yml versions packages itself."`

**Step 5: Lint and commit (no changeset yet)**

```bash
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest
git add .github/workflows/release.yml
git commit -m "ci(release): version bumps commit to master; no Version packages PR"
git push origin master
gh run watch $(gh run list --workflow release.yml -L 1 --json databaseId --jq '.[0].databaseId') --exit-status
```

Expected: `version` runs and outputs only `sha`. `npm` and `extension` are skipped, and the web image deploys.

**Step 6: Prove a changeset releases**

Release the package as a patch. That's the only real test, and it also publishes `scripture-guide` if Task 11 is done. If it isn't done yet, expect the `npm` job to fail with E404 and do Task 11 first.

```bash
cat > .changeset/release-pipeline.md <<'EOF'
---
"scripture-guide": patch
---

Released through the new single-push pipeline.
EOF
git add .changeset/release-pipeline.md
git commit -m "chore: changeset for the first single-push release"
git push origin master
```

Expected:
- A `chore: release scripture-guide@1.1.1 web@2.0.2 extension@2.1.2` commit by github-actions appears on master. The web and extension bump because they depend on the package.
- `npm view scripture-guide version` prints `1.1.1`.
- The extension job uploads 2.1.2. This works only if 2.1.1 already passed review, or Task 5's cancel step is in. **Do Task 5 before this step.**
- `git pull` locally afterwards.

---

### Task 5: Shared Chrome Web Store script, with cancel-before-upload

Move the curl calls out of `release.yml` into a script that the release job, the status workflow (Task 6) and the skills (Task 9) all use. Before uploading, cancel a submission that's still pending, so a quick follow-up release never collides with a review.

**Files:**
- Create: `scripts/release/cws.sh`
- Modify: `.github/workflows/release.yml` (extension job's "Upload and publish" step)

**Step 1: Find the real field names in a status response**

Dispatch the release run with `extension: true` isn't safe yet, because it would upload. Instead, temporarily add this step to the extension job behind `if: inputs.extension`, or use Task 6's workflow first, and print one raw response:

```bash
curl -sS -H "Authorization: Bearer $TOKEN" "https://chromewebstore.googleapis.com/v2/publishers/$PUBLISHER_ID/items/$EXTENSION_ID:fetchStatus" | jq .
```

Record the actual keys. The expected shape is `publishedItemRevisionStatus.state`, `publishedItemRevisionStatus.distributionChannels[].crxVersion`, `submittedItemRevisionStatus.state`, `lastAsyncUploadState`, `takenDown`. Use what the response shows in Step 2, not this guess. Also confirm the cancel method name in the API reference (expected `:cancelSubmission`).

**Step 2: Write `scripts/release/cws.sh`**

```bash
#!/usr/bin/env bash
# Chrome Web Store API v2 for the Scripture Guide extension.
#   cws.sh status            print a one-line summary; exit 2 if rejected or taken down
#   cws.sh cancel-pending    cancel a submission still in review (no-op otherwise)
#   cws.sh upload ZIP        upload a package and wait for it to process
#   cws.sh publish           submit the uploaded package for review
# Needs TOKEN (OAuth token with the chromewebstore scope) and PUBLISHER_ID.
set -euo pipefail
: "${TOKEN:?set TOKEN}" "${PUBLISHER_ID:?set PUBLISHER_ID}"
EXTENSION_ID="${EXTENSION_ID:-lkagejkikblabiegfnehlknmlgckhgan}"
API=https://chromewebstore.googleapis.com
ITEM="publishers/${PUBLISHER_ID}/items/${EXTENSION_ID}"
AUTH=(-H "Authorization: Bearer ${TOKEN}")

fetch_status() { curl -sS --fail-with-body "${AUTH[@]}" "${API}/v2/${ITEM}:fetchStatus"; }

case "${1:-}" in
  status)
    s=$(fetch_status)
    live=$(jq -r '[.publishedItemRevisionStatus.distributionChannels[]?.crxVersion] | first // "none"' <<<"$s")
    sub=$(jq -r '.submittedItemRevisionStatus.state // "none"' <<<"$s")
    subv=$(jq -r '[.submittedItemRevisionStatus.distributionChannels[]?.crxVersion] | first // ""' <<<"$s")
    down=$(jq -r '.takenDown // false' <<<"$s")
    echo "live=${live} submitted=${sub}${subv:+ (${subv})} takenDown=${down}"
    [ "$sub" = REJECTED ] || [ "$down" = true ] && exit 2
    exit 0 ;;
  cancel-pending)
    sub=$(fetch_status | jq -r '.submittedItemRevisionStatus.state // "none"')
    if [ "$sub" = PENDING_REVIEW ]; then
      curl -sS --fail-with-body "${AUTH[@]}" -X POST "${API}/v2/${ITEM}:cancelSubmission"
      echo "cancelled the submission that was pending review"
    fi ;;
  upload)
    zip="${2:?usage: cws.sh upload ZIP}"
    r=$(curl -sS --fail-with-body "${AUTH[@]}" -H 'Content-Type: application/zip' --data-binary @"$zip" "${API}/upload/v2/${ITEM}:upload")
    echo "upload: $r"
    state=$(jq -r .uploadState <<<"$r")
    for _ in $(seq 1 30); do
      [ "$state" = IN_PROGRESS ] || break
      sleep 10
      state=$(fetch_status | jq -r .lastAsyncUploadState)
      echo "upload state: $state"
    done
    [ "$state" = SUCCEEDED ] || { echo "::error::upload ended in state $state"; exit 1; } ;;
  publish)
    # No --fail: a rejected submission's reason is in the body, so print it first
    r=$(curl -sS "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"publishType":"DEFAULT_PUBLISH"}' "${API}/v2/${ITEM}:publish")
    echo "publish: $r"
    case "$(jq -r .state <<<"$r")" in
      PENDING_REVIEW|PUBLISHED|STAGED|PUBLISHED_TO_TESTERS) ;;
      *) echo "::error::publish was not accepted"; exit 1 ;;
    esac ;;
  *) sed -n '2,7p' "$0"; exit 64 ;;
esac
```

Adjust the jq paths to what Step 1 showed. Then:

```bash
chmod +x scripts/release/cws.sh
docker run --rm -v "$PWD":/mnt koalaman/shellcheck:stable scripts/release/cws.sh
```

Expected: no warnings.

**Step 3: Use it in `release.yml`**

Replace the body of the "Upload and publish to the Chrome Web Store" step with:

```bash
          scripts/release/cws.sh cancel-pending
          scripts/release/cws.sh upload apps/chrome-extension/extension.zip
          scripts/release/cws.sh publish
```

Keep `TOKEN: ${{ steps.google.outputs.access_token }}` in the step env. `PUBLISHER_ID` is already in the job env.

**Step 4: Lint, commit, push**

```bash
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest
git add scripts/release/cws.sh .github/workflows/release.yml
git commit -m "ci(extension): one store script; cancel a pending review before a new upload"
git push origin master
```

---

### Task 6: Hourly store status

**Files:**
- Create: `.github/workflows/store-status.yml`

**Step 1: Write it**

```yaml
name: store-status
# Reports the Chrome Web Store's verdict on the extension. Fails (and GitHub emails KC) when the
# latest submission is rejected or the item is taken down. Run by hand any time: gh workflow run store-status.yml
on:
  schedule:
    - cron: '17 * * * *'
  workflow_dispatch:
permissions:
  contents: read
  id-token: write
jobs:
  status:
    if: vars.CWS_PUBLISHER_ID != ''
    runs-on: ubuntu-latest
    timeout-minutes: 5
    env:
      PUBLISHER_ID: ${{ vars.CWS_PUBLISHER_ID }}
    steps:
      - uses: actions/checkout@v7
      - id: google
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: projects/1065695413052/locations/global/workloadIdentityPools/github/providers/scriptureguide
          service_account: cws-publisher@book-of-mormon-online.iam.gserviceaccount.com
          token_format: access_token
          access_token_scopes: https://www.googleapis.com/auth/chromewebstore
      - env: { TOKEN: '${{ steps.google.outputs.access_token }}' }
        run: |
          set +e
          line=$(scripts/release/cws.sh status); code=$?
          echo "$line"
          echo "### Chrome Web Store: $line" >> "$GITHUB_STEP_SUMMARY"
          [ "$code" = 0 ] || { echo "::error::the store rejected the latest submission or took the item down: $line"; exit 1; }
```

Scheduled runs use the default branch, so the OIDC token's ref is `refs/heads/master` and the provider's condition is met.

**Step 2: Lint, commit, push, run it**

```bash
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest
git add .github/workflows/store-status.yml
git commit -m "ci: hourly Chrome Web Store status; fails on rejection"
git push origin master
gh workflow run store-status.yml && sleep 30
gh run view $(gh run list --workflow store-status.yml -L 1 --json databaseId --jq '.[0].databaseId') --log | grep 'live='
```

Expected: a line like `live=2.1.1 submitted=none takenDown=false`. If it printed nulls, go back to Task 5 Step 1 and fix the jq paths.

---

### Task 7: Rollback workflow

Point `:edge` at an older image that release.yml already signed. bom's autodeploy deploys it within a minute, because the signature is still valid. Nothing changes on the server. The next push to master deploys over it, which is the intended way out of a rollback.

**Files:**
- Create: `.github/workflows/rollback.yml`

**Step 1: Write it**

```yaml
name: rollback
# Puts an earlier build back on scripture.guide: points :edge at that commit's signed image.
# bom's autodeploy picks it up within a minute. The next push to master replaces it.
on:
  workflow_dispatch:
    inputs:
      sha:
        description: Commit to put back (full or short sha)
        required: true
permissions:
  contents: read
  packages: write
jobs:
  rollback:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      IMAGE: ghcr.io/kckern/scripture-guide
    steps:
      - uses: actions/checkout@v7
        with: { fetch-depth: 0 }
      - uses: docker/setup-buildx-action@v4
      - uses: docker/login-action@v4
        with: { registry: ghcr.io, username: '${{ github.actor }}', password: '${{ secrets.GITHUB_TOKEN }}' }
      - uses: sigstore/cosign-installer@v3
      - env: { SHA: '${{ inputs.sha }}' }
        run: |
          full=$(git rev-parse --verify "${SHA}^{commit}")
          src=""
          # Images from before 2026-11-20 only carry a short tag; try the lengths git uses.
          for tag in "sha-$full" "sha-${full:0:7}" "sha-${full:0:8}" "sha-${full:0:9}"; do
            if docker buildx imagetools inspect "$IMAGE:$tag" >/dev/null 2>&1; then src="$IMAGE:$tag"; break; fi
          done
          [ -n "$src" ] || { echo "::error::no image for $full"; exit 1; }
          digest=$(docker buildx imagetools inspect "$src" --format '{{json .Manifest}}' | jq -r .digest)
          cosign verify "$IMAGE@$digest" \
            --certificate-oidc-issuer https://token.actions.githubusercontent.com \
            --certificate-identity-regexp '^https://github\.com/kckern/ScriptureGuide/\.github/workflows/release\.yml@refs/heads/master$' >/dev/null
          docker buildx imagetools create -t "$IMAGE:edge" "$IMAGE@$digest"
          echo "### :edge now points at ${full:0:7} ($digest). Live within about a minute; check /healthz." >> "$GITHUB_STEP_SUMMARY"
```

**Step 2: Lint, commit, push**

```bash
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest
git add .github/workflows/rollback.yml
git commit -m "ci: rollback workflow points :edge at an earlier signed build"
git push origin master
```

**Step 3: Drill it** (the site serves an older build for about 5 minutes; tell KC first)

```bash
prev=$(git rev-parse HEAD~1)   # a commit with an image built after Task 3
gh workflow run rollback.yml -f sha=$prev
sleep 120; curl -s https://scripture.guide/healthz    # "commit": "<prev>"
gh workflow run release.yml                            # deploys master again
sleep 300; curl -s https://scripture.guide/healthz    # "commit": "<HEAD>"
```

---

### Task 8: Dependabot merges itself when tests pass

**Files:**
- Create: `.github/workflows/dependabot.yml`
- Modify: `.github/dependabot.yml` (group github-actions updates too)

**Step 1: Group Actions updates**

In `.github/dependabot.yml`, under the `github-actions` entry, add:

```yaml
    groups:
      actions:
        patterns: ['*']
```

**Step 2: Write `.github/workflows/dependabot.yml`**

```yaml
name: dependabot
# Merges Dependabot's patch and minor updates once the full test suite passes, then starts a
# release (a merge made with GITHUB_TOKEN does not trigger release.yml by itself).
# Major updates stay open for a person.
on: pull_request
permissions:
  contents: write
  pull-requests: write
  actions: write
jobs:
  meta:
    if: github.event.pull_request.user.login == 'dependabot[bot]'
    runs-on: ubuntu-latest
    outputs:
      type: ${{ steps.m.outputs.update-type }}
    steps:
      - id: m
        uses: dependabot/fetch-metadata@v2
  test:
    needs: meta
    if: needs.meta.outputs.type != 'version-update:semver-major'
    uses: ./.github/workflows/test.yml
  merge:
    needs: test
    runs-on: ubuntu-latest
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      PR: ${{ github.event.pull_request.html_url }}
    steps:
      - run: gh pr merge --squash "$PR"
      - run: gh workflow run release.yml --repo "$GITHUB_REPOSITORY" --ref master
```

**Step 3: Lint, commit, push, then rebase the open PRs**

```bash
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest
git add .github/dependabot.yml .github/workflows/dependabot.yml
git commit -m "ci: merge passing Dependabot patch and minor updates"
git push origin master
for n in $(gh pr list --author app/dependabot --json number --jq '.[].number'); do gh pr comment $n --body '@dependabot rebase'; done
```

Expected: the minor and patch PRs (#31 serialize-javascript, #32 body-parser) merge themselves within about 10 minutes. The majors (#21 vitest 5, #22 eslint 10, #23 helmet 8, #24/#25 babel 8, #27 build-push-action 7, #29 vite 8) stay open. List them for KC as follow-up work, one per session.

---

### Task 9: Three project skills

Skills live in the repo so they're versioned with the pipeline they describe.

**Files:**
- Create: `.claude/skills/ship-web/SKILL.md`
- Create: `.claude/skills/ship-extension/SKILL.md`
- Create: `.claude/skills/ship-npm/SKILL.md`
- Modify: `.gitignore` if it ignores `.claude/` (keep `.claude/settings.local.json` and `.claude/worktrees` ignored)

**Step 1: Check `.claude` isn't ignored**

```bash
git check-ignore -v .claude/skills/x/SKILL.md || echo "not ignored"
```

If it's ignored, change the rule to ignore only `.claude/settings.local.json` and `.claude/worktrees/`.

**Step 2: Write `.claude/skills/ship-web/SKILL.md`**

```markdown
---
name: ship-web
description: Use when shipping, deploying, checking or rolling back scripture.guide (the website / Docker image) - "push to prod", "is it live", "deploy", "roll back", "prod still shows the old version".
---

# Ship the website

Every push to master deploys. There is no staging step and no manual approval.

## Ship
1. Commit on master and `git push origin master`.
2. `gh run watch $(gh run list --workflow release.yml -L 1 --json databaseId --jq '.[0].databaseId') --exit-status`
3. About 2 minutes after `web-image` finishes, `curl -s https://scripture.guide/healthz` must show `"commit"` equal to the pushed sha (or the `chore: release` commit after it). Report the commit and status to KC.

## If it isn't live
- `test` failed: nothing shipped. Fix the test and push again.
- Run green but `/healthz` shows an older commit: the deploy on bom refused it or rolled it back. `ssh bom 'journalctl -u sg-deploy -n 50 --no-pager'`. A signature failure means the image wasn't built by release.yml on master. "Unhealthy" means the container failed `/health`; the log shows the container's last 60 lines.
- ssh times out: bom's security group lacks the current IP. See memory `bom-ops-access`.
- Old fonts or CSS after a deploy: check the NPM proxy host 1 asset cache is still off.

## Roll back
`gh workflow run rollback.yml -f sha=<good commit>`. Within about a minute `/healthz` shows that commit. The next push to master deploys over it, so fix forward and push.
```

**Step 3: Write `.claude/skills/ship-extension/SKILL.md`**

```markdown
---
name: ship-extension
description: Use when releasing the Scripture Guide Chrome extension to the Chrome Web Store, checking its review status, or when a store submission was rejected.
---

# Ship the Chrome extension

A push that contains a changeset for `scripture-guide-chrome-extension` (or for `scripture-guide`, which bumps the extension too) uploads a new version and submits it for review. Google's review usually takes hours.

## Before releasing
1. `npm test -w scripture-guide-chrome-extension && npm run build -w scripture-guide-chrome-extension`
2. Try the build on real pages: load `apps/chrome-extension/dist` unpacked and open a long page (a conference talk) and https://www.jw.org/en/jehovahs-witnesses/faq/are-jehovahs-witnesses-christians/. No "Page Unresponsive", and references (including ones that are already links) become badges.

## Release
1. Write `.changeset/<slug>.md`:
   ---
   "scripture-guide-chrome-extension": patch
   ---
   One line a store user would understand.
   Use minor for new features. Ask KC before a major.
2. Commit and push to master. The `version` job commits `chore: release … extension@x.y.z`. The `extension` job cancels any submission still in review, uploads and submits.
3. Check the `extension` job log ends with `"state": "PENDING_REVIEW"`, then `git pull`.

## Status
`gh workflow run store-status.yml`, then read the run summary: `live=<version> submitted=<state>`. It also runs hourly and fails, which emails KC, if Google rejects the submission.

## Rejections
- INVALID_ITEM_METADATA: the listing (privacy tab, permission justifications) is incomplete. KC fixes it in the Developer Dashboard. The privacy policy URL is https://scripture.guide/privacy-policy.
- A new permission in manifest.json needs a justification in the dashboard before submitting. Tell KC first.
- To retry an upload without a new version: `gh workflow run release.yml -f extension=true`.
```

**Step 4: Write `.claude/skills/ship-npm/SKILL.md`**

```markdown
---
name: ship-npm
description: Use when publishing the scripture-guide npm package, or when the npm job in release.yml fails.
---

# Ship the npm package

A push that contains a changeset for `scripture-guide` publishes it to npm with trusted publishing (GitHub OIDC, no token). The website and extension get a patch bump too, because they depend on it.

## Release
1. Write `.changeset/<slug>.md`:
   ---
   "scripture-guide": patch
   ---
   What changed, for someone who installs the package.
   Patch for fixes, minor for new exports or options. Ask KC before a major.
2. Commit and push to master. Watch the `npm` job in release.yml.
3. `npm view scripture-guide version` shows the new version, and the npm page shows a provenance badge. `git pull`.

## If the npm job fails
- E404 on PUT: npmjs.com doesn't trust the workflow. On npmjs.com, scripture-guide → Settings → Trusted Publisher → GitHub Actions needs org `kckern`, repo `ScriptureGuide`, workflow `release.yml`. Only KC can set this.
- Job skipped: the repo variable `NPM_PUBLISH` isn't `true` (`gh variable list`).
- To publish a version that's already committed: `gh workflow run release.yml` won't do it, because nothing bumps. Publish once from a dispatch-only fix, or ask KC.
```

**Step 5: Commit**

```bash
git add .claude/skills .gitignore
git commit -m "docs: ship-web, ship-extension and ship-npm skills"
git push origin master
```

---

### Task 10: Update memory and remove stale notes

**Files (outside the repo, in `~/.claude/projects/-Users-kckern-Documents-GitHub-ScriptureGuideUtils/memory/`):**
- Modify: `feedback-work-on-master.md`: delete "Production still pins a digest in bom-infra, so a push does not deploy". Point to the `ship-web` skill.
- Modify: `chrome-web-store-publishing.md`: replace "merged Version packages PR #15" with "a push carrying a changeset". Add that `scripts/release/cws.sh` and `store-status.yml` exist, and that the manual IAM-grant method for checking status is no longer needed.
- Modify: `scriptureguide-unification.md`: in the "Continuous deploy" section, add the test gate, `/healthz` commit and `rollback.yml`.

Also edit `docs/plans/2026-11-19-extension-responsiveness-design.md` "Release" section: replace the reference to PR #15 with "a push carrying a changeset".

Commit the docs change: `git commit -am "docs: release notes follow the single-push pipeline" && git push origin master`.

---

### Task 11 (KC, one time): trust release.yml on npmjs.com

Only KC can do this, because it needs the npm account login.

1. Sign in at npmjs.com → packages → `scripture-guide` → Settings → **Trusted Publisher** → GitHub Actions.
2. Organization or user `kckern`, repository `ScriptureGuide`, workflow filename `release.yml`, environment blank.
3. Optional, recommended: under Publishing access, choose "Require two-factor authentication and disallow tokens", since CI no longer needs a token.

Then Task 4 Step 6 publishes `scripture-guide@1.1.1`.

---

## Order and checkpoints

1. Tasks 1 → 3 (safety: Node 24, tests gate deploys). Checkpoint: the failing-test drill in Task 3 Step 8.
2. Task 5 → 4 (store script first, so the first versioned release can't collide with a pending review) → 6. Checkpoint: Task 4 Step 6 ships all three surfaces from one push.
3. Tasks 7, 8, 9, 10 in any order.

## Out of scope

- The major Dependabot upgrades (vitest 5, eslint 10, helmet 8, babel 8, vite 8, build-push-action 7). Each is its own piece of work.
- `stack.yml` (the compose and Sphinx integration run). It still runs on push and pull request and doesn't gate a release, because it takes several minutes and needs Sphinx. Gate on it later if it proves stable.
- Any change on bom. The rollback works through the existing autodeploy.
